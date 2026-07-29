from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from typing import Any

from .chunking import TextSegment, chunk_segments
from .config import Settings
from .extractors import extract_segments
from .providers import AIProvider
from .schemas import (
    ChatRequest,
    ChatResponse,
    DocumentSummary,
    GeneratedReviewPackage,
    GroundedAnswer,
    IngestResult,
    RetrieveRequest,
    RetrieveResponse,
    ReviewPackageRequest,
    ReviewPackageResponse,
    ReviewPoint,
    SimilarCase,
    SourceReference,
    TextIngestRequest,
)
from .store import SQLiteStore, SearchResult, StoredChunk


class EmptyDocumentError(ValueError):
    pass


class ReviewCopilotService:
    def __init__(self, settings: Settings, store: SQLiteStore, provider: AIProvider):
        self.settings = settings
        self.store = store
        self.provider = provider

    def _top_k(self, requested: int | None) -> int:
        return min(requested or self.settings.default_top_k, self.settings.max_top_k)

    def _embed_batches(self, texts: Sequence[str], batch_size: int = 64) -> list[list[float]]:
        embeddings: list[list[float]] = []
        for start in range(0, len(texts), batch_size):
            embeddings.extend(self.provider.embed(texts[start : start + batch_size]))
        if len(embeddings) != len(texts):
            raise RuntimeError("Embedding provider returned an unexpected item count")
        return embeddings

    def _index(
        self,
        *,
        filename: str,
        content_type: str,
        source_kind: str,
        project_id: str | None,
        metadata: dict[str, Any],
        checksum: str,
        segments: Sequence[TextSegment],
    ) -> IngestResult:
        duplicate = self.store.find_duplicate(checksum, project_id)
        if duplicate:
            return IngestResult(
                document=DocumentSummary.model_validate(duplicate), indexed=False
            )

        chunks = chunk_segments(segments)
        if not chunks:
            raise EmptyDocumentError("No readable text was found in the document")
        embeddings = self._embed_batches([chunk.text for chunk in chunks])
        stored_chunks = [
            StoredChunk(
                text=chunk.text,
                locator=chunk.locator,
                metadata=chunk.metadata,
                embedding=embedding,
            )
            for chunk, embedding in zip(chunks, embeddings)
        ]
        summary = self.store.add_document(
            filename=filename,
            content_type=content_type,
            source_kind=source_kind,
            project_id=project_id,
            checksum=checksum,
            metadata=metadata,
            embedding_model=self.provider.embedding_model,
            chunks=stored_chunks,
        )
        return IngestResult(
            document=DocumentSummary.model_validate(summary), indexed=True
        )

    def ingest_file(
        self,
        *,
        filename: str,
        content_type: str | None,
        data: bytes,
        source_kind: str,
        project_id: str | None,
        metadata: dict[str, Any] | None = None,
    ) -> IngestResult:
        if len(data) > self.settings.max_upload_bytes:
            raise ValueError(
                f"File exceeds the {self.settings.max_upload_bytes // 1024 // 1024} MB limit"
            )
        segments = extract_segments(filename, content_type, data)
        return self._index(
            filename=filename,
            content_type=content_type or "application/octet-stream",
            source_kind=source_kind,
            project_id=project_id,
            metadata=metadata or {},
            checksum=hashlib.sha256(data).hexdigest(),
            segments=segments,
        )

    def ingest_text(self, request: TextIngestRequest) -> IngestResult:
        payload = request.text.encode("utf-8")
        return self._index(
            filename=request.title,
            content_type="text/plain",
            source_kind=request.source_kind,
            project_id=request.project_id,
            metadata=request.metadata,
            checksum=hashlib.sha256(payload).hexdigest(),
            segments=[TextSegment(text=request.text, locator="document")],
        )

    @staticmethod
    def _sources(results: Sequence[SearchResult]) -> list[SourceReference]:
        return [
            SourceReference(
                source_id=f"S{index}",
                document_id=result.document_id,
                filename=result.filename,
                source_kind=result.source_kind,
                locator=result.locator,
                excerpt=result.text[:700],
                score=result.score,
                metadata=result.metadata,
            )
            for index, result in enumerate(results, start=1)
        ]

    @staticmethod
    def _context(sources: Sequence[SourceReference]) -> str:
        parts = []
        for source in sources:
            location = f", {source.locator}" if source.locator else ""
            parts.append(
                f"[{source.source_id}] {source.filename}{location} "
                f"(유형: {source.source_kind})\n{source.excerpt}"
            )
        return "\n\n".join(parts)

    def retrieve(self, request: RetrieveRequest) -> RetrieveResponse:
        query_embedding = self.provider.embed([request.query])[0]
        results = self.store.hybrid_search(
            query=request.query,
            query_embedding=query_embedding,
            embedding_model=self.provider.embedding_model,
            limit=self._top_k(request.top_k),
            project_id=request.project_id,
            document_ids=request.document_ids,
        )
        return RetrieveResponse(query=request.query, sources=self._sources(results))

    @staticmethod
    def _valid_ids(answer_ids: Sequence[str], allowed: set[str]) -> list[str]:
        return list(dict.fromkeys(source_id for source_id in answer_ids if source_id in allowed))

    def chat(self, request: ChatRequest) -> ChatResponse:
        retrieval = self.retrieve(
            RetrieveRequest(
                query=request.message,
                top_k=request.top_k,
                project_id=request.project_id,
                document_ids=request.document_ids,
            )
        )
        if not retrieval.sources:
            answer = GroundedAnswer(
                answer="현재 등록된 자료에서 질문을 뒷받침할 근거를 찾지 못했습니다.",
                cited_source_ids=[],
                insufficient_evidence=True,
                follow_up_questions=["관련 기준 또는 과거 검토 사례를 먼저 등록해 주세요."],
            )
        else:
            answer = self.provider.answer(
                message=request.message,
                history=[message.model_dump() for message in request.history],
                context=self._context(retrieval.sources),
            )
        allowed = {source.source_id for source in retrieval.sources}
        cited_ids = self._valid_ids(answer.cited_source_ids, allowed)
        return ChatResponse(
            answer=answer.answer,
            cited_source_ids=cited_ids,
            insufficient_evidence=answer.insufficient_evidence or not cited_ids,
            follow_up_questions=answer.follow_up_questions,
            sources=retrieval.sources,
            model=self.provider.model,
        )

    @staticmethod
    def _review_query(request: ReviewPackageRequest) -> str:
        target = request.target
        parts = [target.name]
        if target.category:
            parts.append(target.category)
        if target.location:
            parts.append(target.location)
        parts.append(json.dumps(target.properties, ensure_ascii=False))
        for element in target.related_elements[:30]:
            parts.append(
                f"{element.name} {element.category or ''} "
                f"{json.dumps(element.properties, ensure_ascii=False)}"
            )
        if request.question:
            parts.append(request.question)
        return "\n".join(part for part in parts if part).strip()

    def _sanitize_package(
        self, package: GeneratedReviewPackage, allowed: set[str]
    ) -> GeneratedReviewPackage:
        review_points = []
        for point in package.review_points:
            evidence = self._valid_ids(point.evidence_ids, allowed)
            review_points.append(
                ReviewPoint(
                    topic=point.topic,
                    finding=point.finding,
                    why_it_matters=point.why_it_matters,
                    evidence_ids=evidence,
                    status="supported" if evidence and point.status == "supported" else "needs_confirmation",
                )
            )
        similar_cases = [
            SimilarCase(
                title=case.title,
                similarity_reason=case.similarity_reason,
                different_conditions=case.different_conditions,
                evidence_ids=self._valid_ids(case.evidence_ids, allowed),
            )
            for case in package.similar_cases
        ]
        alternatives = [
            alternative.model_copy(
                update={
                    "evidence_ids": self._valid_ids(
                        alternative.evidence_ids,
                        allowed,
                    )
                }
            )
            for alternative in package.alternatives
        ]
        return GeneratedReviewPackage(
            summary=package.summary,
            review_points=review_points,
            similar_cases=similar_cases,
            missing_information=package.missing_information,
            recommended_questions=package.recommended_questions,
            limitations=package.limitations,
            cited_source_ids=self._valid_ids(package.cited_source_ids, allowed),
            alternatives=alternatives,
        )

    def review_package(self, request: ReviewPackageRequest) -> ReviewPackageResponse:
        retrieval = self.retrieve(
            RetrieveRequest(
                query=self._review_query(request),
                top_k=request.top_k,
                project_id=request.project_id,
                document_ids=request.document_ids,
            )
        )
        package = self.provider.review_package(
            target=request.target,
            question=request.question,
            context=self._context(retrieval.sources),
        )
        package = self._sanitize_package(
            package, {source.source_id for source in retrieval.sources}
        )
        return ReviewPackageResponse(
            **package.model_dump(),
            target=request.target,
            sources=retrieval.sources,
            model=self.provider.model,
        )
