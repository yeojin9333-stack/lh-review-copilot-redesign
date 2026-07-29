from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TextIngestRequest(StrictModel):
    title: str = Field(min_length=1, max_length=300)
    text: str = Field(min_length=1)
    source_kind: str = Field(default="manual", max_length=100)
    project_id: str | None = Field(default=None, max_length=120)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentSummary(StrictModel):
    id: str
    filename: str
    content_type: str
    source_kind: str
    project_id: str | None
    chunk_count: int
    created_at: str
    metadata: dict[str, Any]


class IngestResult(StrictModel):
    document: DocumentSummary
    indexed: bool


class RetrieveRequest(StrictModel):
    query: str = Field(min_length=2, max_length=4000)
    top_k: int | None = Field(default=None, ge=1, le=50)
    project_id: str | None = Field(default=None, max_length=120)
    document_ids: list[str] = Field(default_factory=list, max_length=100)


class SourceReference(StrictModel):
    source_id: str
    document_id: str
    filename: str
    source_kind: str
    locator: str | None
    excerpt: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class RetrieveResponse(StrictModel):
    query: str
    sources: list[SourceReference]


class ChatMessage(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class ChatRequest(StrictModel):
    message: str = Field(min_length=2, max_length=12000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    top_k: int | None = Field(default=None, ge=1, le=50)
    project_id: str | None = Field(default=None, max_length=120)
    document_ids: list[str] = Field(default_factory=list, max_length=100)


class GroundedAnswer(StrictModel):
    answer: str
    cited_source_ids: list[str]
    insufficient_evidence: bool
    follow_up_questions: list[str]


class ChatResponse(GroundedAnswer):
    sources: list[SourceReference]
    model: str


class RelatedElement(StrictModel):
    name: str
    category: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class ReviewTarget(StrictModel):
    name: str = Field(min_length=1, max_length=300)
    category: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=500)
    properties: dict[str, Any] = Field(default_factory=dict)
    related_elements: list[RelatedElement] = Field(default_factory=list, max_length=100)


class ReviewPackageRequest(StrictModel):
    target: ReviewTarget
    question: str | None = Field(default=None, max_length=4000)
    project_id: str | None = Field(default=None, max_length=120)
    document_ids: list[str] = Field(default_factory=list, max_length=100)
    top_k: int | None = Field(default=None, ge=1, le=50)


class ReviewPoint(StrictModel):
    topic: str
    finding: str
    why_it_matters: str
    evidence_ids: list[str]
    status: Literal["supported", "needs_confirmation"]


class SimilarCase(StrictModel):
    title: str
    similarity_reason: str
    different_conditions: list[str]
    evidence_ids: list[str]


class AlternativeImpact(StrictModel):
    movement: str
    time: str
    cost: str


class ReviewAlternative(StrictModel):
    id: Literal["current", "alt1", "alt2", "alt3"]
    label: str
    title: str
    description: str
    geometry_change: str
    checks: list[str]
    impact: AlternativeImpact
    evidence_ids: list[str]


class GeneratedReviewPackage(StrictModel):
    summary: str
    review_points: list[ReviewPoint]
    similar_cases: list[SimilarCase]
    missing_information: list[str]
    recommended_questions: list[str]
    limitations: list[str]
    cited_source_ids: list[str]
    alternatives: list[ReviewAlternative] = Field(default_factory=list, max_length=4)


class ReviewPackageResponse(GeneratedReviewPackage):
    target: ReviewTarget
    sources: list[SourceReference]
    model: str
    sourceMode: Literal["llm"] = "llm"


class HealthResponse(StrictModel):
    status: Literal["ok"]
    llm_configured: bool
    model: str
    embedding_model: str
    documents: int
    mode: Literal["external-llm-rag"] = "external-llm-rag"
    sourceMode: Literal["llm", "mock"] = "mock"
    fallback_active: bool = False
