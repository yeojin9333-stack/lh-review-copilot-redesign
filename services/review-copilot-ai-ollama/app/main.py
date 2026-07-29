from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .config import Settings, get_settings
from .extractors import UnsupportedDocumentError
from .ollama_provider import OllamaProvider
from .providers import ProviderConfigurationError, ProviderResponseError
from .schemas import (
    ChatRequest,
    ChatResponse,
    DocumentSummary,
    HealthResponse,
    IngestResult,
    RetrieveRequest,
    RetrieveResponse,
    ReviewPackageRequest,
    ReviewPackageResponse,
    TextIngestRequest,
)
from .service import EmptyDocumentError, ReviewCopilotService
from .store import SQLiteStore


@dataclass
class Container:
    settings: Settings
    store: SQLiteStore
    service: ReviewCopilotService | None
    provider: OllamaProvider


def _container(settings: Settings) -> Container:
    store = SQLiteStore(settings.data_dir / "review_copilot.sqlite3")
    store.initialize()
    provider = OllamaProvider(settings)
    service = ReviewCopilotService(settings, store, provider)
    return Container(
        settings=settings,
        store=store,
        service=service,
        provider=provider,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()
    container = _container(resolved)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.container = container
        yield

    app = FastAPI(
        title="LH Review Copilot AI API",
        version="0.1.0",
        description="Portable, evidence-grounded LLM and RAG backend.",
        lifespan=lifespan,
    )
    app.state.container = container
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ProviderConfigurationError)
    async def provider_configuration_handler(
        _request: Request, error: ProviderConfigurationError
    ):
        return JSONResponse(status_code=503, content={"detail": str(error)})

    @app.exception_handler(ProviderResponseError)
    async def provider_response_handler(_request: Request, error: ProviderResponseError):
        return JSONResponse(status_code=502, content={"detail": str(error)})

    @app.exception_handler(UnsupportedDocumentError)
    @app.exception_handler(EmptyDocumentError)
    @app.exception_handler(ValueError)
    async def validation_handler(_request: Request, error: Exception):
        return JSONResponse(status_code=422, content={"detail": str(error)})

    def get_container(request: Request) -> Container:
        return request.app.state.container

    def get_service(
        current: Annotated[Container, Depends(get_container)],
    ) -> ReviewCopilotService:
        if current.service is None:
            raise ProviderConfigurationError(
                "Ollama service is unavailable. Start Ollama and pull the configured models."
            )
        return current.service

    @app.get("/api/v1/health", response_model=HealthResponse)
    def health(current: Annotated[Container, Depends(get_container)]) -> HealthResponse:
        return HealthResponse(
            status="ok",
            llm_configured=current.provider.is_available(),
            model=current.settings.model,
            embedding_model=current.settings.embedding_model,
            documents=current.store.count_documents(),
            sourceMode="llm" if current.provider.is_available() else "mock",
        )

    @app.get("/api/v1/knowledge/documents", response_model=list[DocumentSummary])
    def list_documents(
        current: Annotated[Container, Depends(get_container)],
    ) -> list[DocumentSummary]:
        return [
            DocumentSummary.model_validate(item)
            for item in current.store.list_documents()
        ]

    @app.post("/api/v1/knowledge/text", response_model=IngestResult)
    def ingest_text(
        payload: TextIngestRequest,
        service: Annotated[ReviewCopilotService, Depends(get_service)],
    ) -> IngestResult:
        return service.ingest_text(payload)

    @app.post("/api/v1/knowledge/documents", response_model=list[IngestResult])
    async def ingest_documents(
        service: Annotated[ReviewCopilotService, Depends(get_service)],
        files: Annotated[list[UploadFile], File(description="Knowledge documents")],
        source_kind: Annotated[str, Form()] = "reference",
        project_id: Annotated[str | None, Form()] = None,
    ) -> list[IngestResult]:
        results: list[IngestResult] = []
        for upload in files:
            data = await upload.read()
            result = await run_in_threadpool(
                service.ingest_file,
                filename=upload.filename or "upload",
                content_type=upload.content_type,
                data=data,
                source_kind=source_kind,
                project_id=project_id,
            )
            results.append(result)
        return results

    @app.delete("/api/v1/knowledge/documents/{document_id}", status_code=204)
    def delete_document(
        document_id: str,
        current: Annotated[Container, Depends(get_container)],
    ) -> None:
        if not current.store.delete_document(document_id):
            raise HTTPException(status_code=404, detail="Document not found")

    @app.post("/api/v1/rag/retrieve", response_model=RetrieveResponse)
    def retrieve(
        payload: RetrieveRequest,
        service: Annotated[ReviewCopilotService, Depends(get_service)],
    ) -> RetrieveResponse:
        return service.retrieve(payload)

    @app.post("/api/v1/chat", response_model=ChatResponse)
    def chat(
        payload: ChatRequest,
        service: Annotated[ReviewCopilotService, Depends(get_service)],
    ) -> ChatResponse:
        return service.chat(payload)

    @app.post("/api/v1/review/package", response_model=ReviewPackageResponse)
    def review_package(
        payload: ReviewPackageRequest,
        service: Annotated[ReviewCopilotService, Depends(get_service)],
    ) -> ReviewPackageResponse:
        return service.review_package(payload)

    return app


app = create_app()
