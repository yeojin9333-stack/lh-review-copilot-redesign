from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path
from typing import Sequence

from app.chunking import TextSegment, chunk_segments
from app.config import Settings
from app.schemas import (
    GeneratedReviewPackage,
    GroundedAnswer,
    ReviewPackageRequest,
    ReviewPoint,
    ReviewTarget,
    SimilarCase,
    TextIngestRequest,
)
from app.service import ReviewCopilotService
from app.store import SQLiteStore


class FakeProvider:
    model = "fake-review-model"
    embedding_model = "fake-embedding-v1"

    @staticmethod
    def _one(text: str) -> list[float]:
        keywords = ["램프", "배수", "트렌치", "결빙", "유지관리", "구조", "소음"]
        values = [float(text.count(keyword)) for keyword in keywords]
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        values.append(digest[0] / 255.0)
        return values

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._one(text) for text in texts]

    def answer(self, *, message, history, context) -> GroundedAnswer:
        return GroundedAnswer(
            answer="램프 배수 검토 시 트렌치 조건을 함께 확인해야 합니다. [S1]",
            cited_source_ids=["S1", "S999"],
            insufficient_evidence=False,
            follow_up_questions=["외기 노출 여부는 무엇인가요?"],
        )

    def review_package(self, *, target, question, context) -> GeneratedReviewPackage:
        return GeneratedReviewPackage(
            summary="램프 주변 배수와 결빙 조건을 함께 검토해야 합니다.",
            review_points=[
                ReviewPoint(
                    topic="배수",
                    finding="트렌치 조건 확인",
                    why_it_matters="램프 시종점의 배수 성능과 연결됩니다.",
                    evidence_ids=["S1", "S404"],
                    status="supported",
                ),
                ReviewPoint(
                    topic="구조",
                    finding="추가 도면 확인",
                    why_it_matters="현재 근거에 구조 조건이 없습니다.",
                    evidence_ids=["S404"],
                    status="supported",
                ),
            ],
            similar_cases=[
                SimilarCase(
                    title="과거 램프 사례",
                    similarity_reason="램프 시점부",
                    different_conditions=["외기 노출 미확인"],
                    evidence_ids=["S1", "S404"],
                )
            ],
            missing_information=["외기 노출 여부"],
            recommended_questions=["결빙 대책이 반영되었나요?"],
            limitations=["전문가의 최종 판단이 필요합니다."],
            cited_source_ids=["S1", "S404"],
        )


class ReviewCopilotServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        settings = Settings(
            model="fake-review-model",
            embedding_model="fake-embedding-v1",
            max_output_tokens=2000,
            data_dir=Path(self.temp.name),
            cors_origins=("http://localhost",),
            max_upload_bytes=1024 * 1024,
            default_top_k=4,
            max_top_k=8,
        )
        store = SQLiteStore(settings.data_dir / "test.sqlite3")
        store.initialize()
        self.store = store
        self.service = ReviewCopilotService(settings, store, FakeProvider())

    def tearDown(self):
        self.temp.cleanup()

    def test_ingest_duplicate_and_hybrid_retrieve(self):
        request = TextIngestRequest(
            title="램프 검토 기준",
            text=(
                "지하주차장 램프 시종점은 배수 트렌치, 결빙, 유지관리 조건을 "
                "함께 확인한다. 과거 사례는 현재 조건과 비교한다."
            ),
            source_kind="design_standard",
            project_id="mvp-ramp",
        )
        first = self.service.ingest_text(request)
        second = self.service.ingest_text(request)
        self.assertTrue(first.indexed)
        self.assertFalse(second.indexed)
        self.assertEqual(self.store.count_documents(), 1)

        response = self.service.retrieve(
            __import__("app.schemas", fromlist=["RetrieveRequest"]).RetrieveRequest(
                query="램프 배수 트렌치 검토",
                project_id="mvp-ramp",
            )
        )
        self.assertGreaterEqual(len(response.sources), 1)
        self.assertEqual(response.sources[0].filename, "램프 검토 기준")
        self.assertEqual(response.sources[0].source_id, "S1")

    def test_review_package_drops_unknown_citations(self):
        self.service.ingest_text(
            TextIngestRequest(
                title="램프 사례",
                text="램프 시점부 배수 트렌치와 결빙 조건을 검토했다.",
                source_kind="past_case",
            )
        )
        response = self.service.review_package(
            ReviewPackageRequest(
                target=ReviewTarget(
                    name="B2 지하주차장 램프",
                    category="Ramp",
                    properties={"slope": "17%"},
                )
            )
        )
        self.assertEqual(response.cited_source_ids, ["S1"])
        self.assertEqual(response.review_points[0].evidence_ids, ["S1"])
        self.assertEqual(response.review_points[1].evidence_ids, [])
        self.assertEqual(response.review_points[1].status, "needs_confirmation")
        self.assertEqual(response.similar_cases[0].evidence_ids, ["S1"])

    def test_delete_removes_document(self):
        result = self.service.ingest_text(
            TextIngestRequest(title="삭제 대상", text="램프 배수 기준 문서")
        )
        self.assertTrue(self.store.delete_document(result.document.id))
        self.assertEqual(self.store.count_documents(), 0)

    def test_windows_cp949_csv_with_korean_filename(self):
        csv_data = (
            "사례번호,검토내용\r\n"
            "CASE-017,램프 배수 트렌치와 결빙 대책 확인\r\n"
        ).encode("cp949")
        result = self.service.ingest_file(
            filename="과거 VE 사례.csv",
            content_type="text/csv",
            data=csv_data,
            source_kind="past_case",
            project_id="mvp-ramp",
        )
        self.assertTrue(result.indexed)
        self.assertEqual(result.document.filename, "과거 VE 사례.csv")

        response = self.service.retrieve(
            __import__("app.schemas", fromlist=["RetrieveRequest"]).RetrieveRequest(
                query="램프 결빙 배수",
                project_id="mvp-ramp",
            )
        )
        self.assertGreaterEqual(len(response.sources), 1)
        self.assertEqual(response.sources[0].filename, "과거 VE 사례.csv")
        self.assertEqual(response.sources[0].locator, "rows")


class ChunkingTest(unittest.TestCase):
    def test_long_segment_is_split_with_locator(self):
        chunks = chunk_segments(
            [TextSegment(text="램프 배수 검토. " * 200, locator="page 7")],
            max_chars=300,
            overlap_chars=40,
        )
        self.assertGreater(len(chunks), 2)
        self.assertTrue(all(chunk.locator == "page 7" for chunk in chunks))
        self.assertTrue(all(len(chunk.text) <= 300 for chunk in chunks))


if __name__ == "__main__":
    unittest.main()
