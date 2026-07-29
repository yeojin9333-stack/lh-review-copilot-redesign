from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from app.config import Settings
from app.ollama_provider import OllamaProvider
from app.schemas import GroundedAnswer


class FakeResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self):
        return json.dumps(self.payload, ensure_ascii=False).encode("utf-8")


def settings() -> Settings:
    return Settings(
        model="qwen-test",
        embedding_model="embedding-test",
        max_output_tokens=2000,
        data_dir=Path("./data"),
        cors_origins=("http://localhost",),
        max_upload_bytes=1024 * 1024,
        default_top_k=4,
        max_top_k=8,
        ollama_base_url="http://127.0.0.1:11434",
    )


def test_ollama_embed_uses_local_embed_endpoint():
    provider = OllamaProvider(settings())
    with patch(
        "app.ollama_provider.urlopen",
        return_value=FakeResponse({"embeddings": [[0.1, 0.2], [0.3, 0.4]]}),
    ) as mocked:
        result = provider.embed(["램프", "배수"])

    assert result == [[0.1, 0.2], [0.3, 0.4]]
    request = mocked.call_args.args[0]
    assert request.full_url == "http://127.0.0.1:11434/api/embed"
    assert json.loads(request.data)["model"] == "embedding-test"


def test_ollama_chat_requests_json_schema():
    provider = OllamaProvider(settings())
    answer = GroundedAnswer(
        answer="배수 트렌치를 확인합니다. [S1]",
        cited_source_ids=["S1"],
        insufficient_evidence=False,
        follow_up_questions=[],
    )
    with patch(
        "app.ollama_provider.urlopen",
        return_value=FakeResponse(
            {"message": {"content": answer.model_dump_json()}}
        ),
    ) as mocked:
        result = provider.answer(
            message="무엇을 확인하나요?",
            history=[],
            context="[S1] 램프 배수 트렌치",
        )

    assert result.cited_source_ids == ["S1"]
    payload = json.loads(mocked.call_args.args[0].data)
    assert payload["model"] == "qwen-test"
    assert payload["stream"] is False
    assert payload["format"]["type"] == "object"
