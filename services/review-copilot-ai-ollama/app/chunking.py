from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable


@dataclass(frozen=True)
class TextSegment:
    text: str
    locator: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class TextChunk:
    text: str
    locator: str | None
    metadata: dict[str, Any]


def _clean(text: str) -> str:
    text = text.replace("\x00", " ").replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line).strip()


def _window(text: str, max_chars: int, overlap_chars: int) -> Iterable[str]:
    start = 0
    while start < len(text):
        hard_end = min(len(text), start + max_chars)
        end = hard_end
        if hard_end < len(text):
            boundary = max(
                text.rfind("\n", start, hard_end),
                text.rfind(". ", start, hard_end),
                text.rfind("다. ", start, hard_end),
                text.rfind(" ", start, hard_end),
            )
            if boundary > start + max_chars // 2:
                end = boundary + 1
        piece = text[start:end].strip()
        if piece:
            yield piece
        if end >= len(text):
            break
        start = max(start + 1, end - overlap_chars)


def chunk_segments(
    segments: Iterable[TextSegment],
    *,
    max_chars: int = 1800,
    overlap_chars: int = 250,
) -> list[TextChunk]:
    if max_chars < 200:
        raise ValueError("max_chars must be at least 200")
    if overlap_chars < 0 or overlap_chars >= max_chars:
        raise ValueError("overlap_chars must be between 0 and max_chars")

    chunks: list[TextChunk] = []
    for segment in segments:
        cleaned = _clean(segment.text)
        if not cleaned:
            continue
        for text in _window(cleaned, max_chars, overlap_chars):
            chunks.append(
                TextChunk(
                    text=text,
                    locator=segment.locator,
                    metadata=dict(segment.metadata),
                )
            )
    return chunks

