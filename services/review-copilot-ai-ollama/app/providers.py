from __future__ import annotations

from typing import Protocol, Sequence

from .schemas import GeneratedReviewPackage, GroundedAnswer, ReviewTarget


class ProviderConfigurationError(RuntimeError):
    pass


class ProviderResponseError(RuntimeError):
    pass


class AIProvider(Protocol):
    model: str
    embedding_model: str

    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...

    def answer(
        self,
        *,
        message: str,
        history: Sequence[dict[str, str]],
        context: str,
    ) -> GroundedAnswer: ...

    def review_package(
        self,
        *,
        target: ReviewTarget,
        question: str | None,
        context: str,
    ) -> GeneratedReviewPackage: ...
