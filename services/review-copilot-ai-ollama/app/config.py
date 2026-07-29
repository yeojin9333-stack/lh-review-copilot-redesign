from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value else default


@dataclass(frozen=True)
class Settings:
    model: str
    embedding_model: str
    max_output_tokens: int
    data_dir: Path
    cors_origins: tuple[str, ...]
    max_upload_bytes: int
    default_top_k: int
    max_top_k: int
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_timeout_seconds: int = 180
    ollama_context_tokens: int = 8192

    @classmethod
    def from_env(cls) -> "Settings":
        origins = tuple(
            origin.strip()
            for origin in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:3000,http://localhost:5173,"
                "https://lh-review-copilot-20260727.geonnii.chatgpt.site",
            ).split(",")
            if origin.strip()
        )
        data_dir = Path(os.getenv("DATA_DIR", "./data")).expanduser().resolve()
        return cls(
            model=os.getenv("OLLAMA_MODEL", "qwen3.5:4b"),
            embedding_model=os.getenv("OLLAMA_EMBEDDING_MODEL", "embeddinggemma"),
            max_output_tokens=_int_env("OLLAMA_MAX_OUTPUT_TOKENS", 2000),
            data_dir=data_dir,
            cors_origins=origins,
            max_upload_bytes=_int_env("MAX_UPLOAD_MB", 25) * 1024 * 1024,
            default_top_k=_int_env("DEFAULT_TOP_K", 4),
            max_top_k=_int_env("MAX_TOP_K", 8),
            ollama_base_url=os.getenv(
                "OLLAMA_BASE_URL", "http://127.0.0.1:11434"
            ),
            ollama_timeout_seconds=_int_env("OLLAMA_TIMEOUT_SECONDS", 180),
            ollama_context_tokens=_int_env("OLLAMA_CONTEXT_TOKENS", 8192),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
