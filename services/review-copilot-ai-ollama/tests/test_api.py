from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_health_openapi_and_unconfigured_llm():
    with tempfile.TemporaryDirectory() as directory:
        settings = Settings(
            model="qwen-test",
            embedding_model="embedding-test",
            max_output_tokens=2000,
            data_dir=Path(directory),
            cors_origins=("http://localhost",),
            max_upload_bytes=1024 * 1024,
            default_top_k=4,
            max_top_k=8,
            ollama_base_url="http://127.0.0.1:9",
            ollama_timeout_seconds=1,
        )
        app = create_app(settings)
        with TestClient(app) as client:
            health = client.get("/api/v1/health")
            assert health.status_code == 200
            assert health.json()["llm_configured"] is False

            openapi = client.get("/openapi.json")
            assert openapi.status_code == 200
            assert "/api/v1/review/package" in openapi.json()["paths"]

            documents = client.get("/api/v1/knowledge/documents")
            assert documents.status_code == 200
            assert documents.json() == []

            chat = client.post("/api/v1/chat", json={"message": "램프 검토"})
            assert chat.status_code == 502
            assert "Ollama" in chat.json()["detail"]
