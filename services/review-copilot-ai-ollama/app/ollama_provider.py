from __future__ import annotations

import json
from typing import Any, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel, ValidationError

from .config import Settings
from .providers import ProviderConfigurationError, ProviderResponseError
from .schemas import GeneratedReviewPackage, GroundedAnswer, ReviewTarget


class OllamaProvider:
    def __init__(self, settings: Settings):
        self.base_url = settings.ollama_base_url.rstrip("/")
        if not self.base_url.startswith(("http://", "https://")):
            raise ProviderConfigurationError(
                "OLLAMA_BASE_URL must start with http:// or https://."
            )
        self.model = settings.model
        self.embedding_model = settings.embedding_model
        self.max_output_tokens = settings.max_output_tokens
        self.timeout_seconds = settings.ollama_timeout_seconds
        self.context_tokens = settings.ollama_context_tokens

    def _request(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            raise ProviderResponseError(
                f"Ollama returned HTTP {error.code}: {body[:500]}"
            ) from error
        except (URLError, TimeoutError, OSError) as error:
            raise ProviderResponseError(
                f"Cannot connect to Ollama at {self.base_url}. "
                "Start Ollama and pull the configured models."
            ) from error
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ProviderResponseError("Ollama returned invalid JSON.") from error

    def is_available(self) -> bool:
        try:
            with urlopen(f"{self.base_url}/api/tags", timeout=2):
                return True
        except (HTTPError, URLError, TimeoutError, OSError):
            return False

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        response = self._request(
            "/api/embed",
            {"model": self.embedding_model, "input": list(texts)},
        )
        embeddings = response.get("embeddings")
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            raise ProviderResponseError(
                "Ollama embedding response did not match the input count."
            )
        return [[float(value) for value in vector] for vector in embeddings]

    def _parse(
        self,
        *,
        messages: list[dict[str, str]],
        schema: type[BaseModel],
    ) -> BaseModel:
        response = self._request(
            "/api/chat",
            {
                "model": self.model,
                "messages": messages,
                "stream": False,
                "format": schema.model_json_schema(),
                "options": {
                    "temperature": 0,
                    "num_ctx": self.context_tokens,
                    "num_predict": self.max_output_tokens,
                },
                "keep_alive": "10m",
            },
        )
        content = response.get("message", {}).get("content")
        if not isinstance(content, str) or not content.strip():
            raise ProviderResponseError("Ollama returned an empty structured response.")
        try:
            return schema.model_validate_json(content)
        except ValidationError as error:
            raise ProviderResponseError(
                "Ollama response did not match the required schema. "
                "Try a larger instruction model."
            ) from error

    def answer(
        self,
        *,
        message: str,
        history: Sequence[dict[str, str]],
        context: str,
    ) -> GroundedAnswer:
        system = (
            "당신은 LH 설계검토 준비를 돕는 Review Copilot이다. 제공된 검색 근거만으로 답한다. "
            "근거에 없는 사실은 추정하지 말고 미확인이라고 표시한다. 안전성, 적정성, 법적 적합성을 "
            "최종 판정하지 않는다. 주요 주장 뒤에는 [S1] 형태의 출처 ID를 적는다. "
            "cited_source_ids에는 실제 사용한 ID만 넣는다. 답은 한국어로 작성한다."
        )
        messages: list[dict[str, str]] = [{"role": "system", "content": system}]
        messages.extend(history[-10:])
        messages.append(
            {
                "role": "user",
                "content": f"질문:\n{message}\n\n검색 근거:\n{context}",
            }
        )
        return self._parse(messages=messages, schema=GroundedAnswer)  # type: ignore[return-value]

    def review_package(
        self,
        *,
        target: ReviewTarget,
        question: str | None,
        context: str,
    ) -> GeneratedReviewPackage:
        system = (
            "당신은 기초 BIM QA/QC가 끝난 뒤 정성적 설계검토 자료를 준비하는 LH Review Copilot이다. "
            "전문가 대신 결론을 내리지 말고 검토 맥락과 근거를 준비한다. 검색 근거에서 확인되는 "
            "내용과 현재 조건을 비교하고, 근거가 없는 항목은 needs_confirmation으로 표시한다. "
            "안전성·적정성·법적 적합성을 확정하지 않는다. evidence_ids와 cited_source_ids에는 "
            "제공된 [S#] ID만 사용한다. 현재안과 대안 1·2·3을 정확히 4개 구성하고, 각 대안은 "
            "BIM 형상 변화와 동선·시간·비용의 정성적 영향 및 확인조건을 포함한다. 시간과 비용은 "
            "근거 없는 수치로 단정하지 않는다. 한국어로 작성한다."
        )
        user = (
            f"검토 대상(JSON):\n{target.model_dump_json(indent=2)}\n\n"
            f"사용자 질문:\n{question or '선택한 대상의 검토 패키지를 구성해 주세요.'}\n\n"
            f"검색 근거:\n{context or '(검색된 근거 없음)'}"
        )
        return self._parse(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            schema=GeneratedReviewPackage,
        )  # type: ignore[return-value]
