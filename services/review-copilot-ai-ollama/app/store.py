from __future__ import annotations

import json
import math
import re
import sqlite3
import struct
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence


@dataclass(frozen=True)
class StoredChunk:
    text: str
    locator: str | None
    metadata: dict[str, Any]
    embedding: Sequence[float]


@dataclass(frozen=True)
class SearchResult:
    chunk_id: str
    document_id: str
    filename: str
    source_kind: str
    locator: str | None
    text: str
    score: float
    metadata: dict[str, Any]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize(vector: Sequence[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if not norm:
        return [0.0 for _ in vector]
    return [float(value / norm) for value in vector]


def _pack(vector: Sequence[float]) -> bytes:
    normalized = _normalize(vector)
    return struct.pack(f"<{len(normalized)}f", *normalized)


def _unpack(blob: bytes, dimension: int) -> tuple[float, ...]:
    return struct.unpack(f"<{dimension}f", blob)


class SQLiteStore:
    def __init__(self, path: Path):
        self.path = path

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    source_kind TEXT NOT NULL,
                    project_id TEXT,
                    checksum TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    embedding_model TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_documents_checksum
                    ON documents(checksum, project_id);

                CREATE TABLE IF NOT EXISTS chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    chunk_index INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    locator TEXT,
                    metadata_json TEXT NOT NULL,
                    embedding BLOB NOT NULL,
                    embedding_dim INTEGER NOT NULL,
                    embedding_model TEXT NOT NULL,
                    UNIQUE(document_id, chunk_index)
                );
                CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
                CREATE INDEX IF NOT EXISTS idx_chunks_embedding_model ON chunks(embedding_model);

                CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                    chunk_id UNINDEXED,
                    content,
                    tokenize='unicode61'
                );
                """
            )

    def _document_summary(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "filename": row["filename"],
            "content_type": row["content_type"],
            "source_kind": row["source_kind"],
            "project_id": row["project_id"],
            "chunk_count": row["chunk_count"],
            "created_at": row["created_at"],
            "metadata": json.loads(row["metadata_json"]),
        }

    def find_duplicate(self, checksum: str, project_id: str | None) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT d.*, COUNT(c.id) AS chunk_count
                FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
                WHERE d.checksum = ? AND d.project_id IS ?
                GROUP BY d.id
                """,
                (checksum, project_id),
            ).fetchone()
        return self._document_summary(row) if row else None

    def add_document(
        self,
        *,
        filename: str,
        content_type: str,
        source_kind: str,
        project_id: str | None,
        checksum: str,
        metadata: dict[str, Any],
        embedding_model: str,
        chunks: Sequence[StoredChunk],
    ) -> dict[str, Any]:
        document_id = str(uuid.uuid4())
        created_at = _now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO documents(
                    id, filename, content_type, source_kind, project_id, checksum,
                    metadata_json, embedding_model, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    document_id,
                    filename,
                    content_type,
                    source_kind,
                    project_id,
                    checksum,
                    json.dumps(metadata, ensure_ascii=False),
                    embedding_model,
                    created_at,
                ),
            )
            for index, chunk in enumerate(chunks):
                chunk_id = str(uuid.uuid4())
                connection.execute(
                    """
                    INSERT INTO chunks(
                        id, document_id, chunk_index, content, locator, metadata_json,
                        embedding, embedding_dim, embedding_model
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk_id,
                        document_id,
                        index,
                        chunk.text,
                        chunk.locator,
                        json.dumps(chunk.metadata, ensure_ascii=False),
                        _pack(chunk.embedding),
                        len(chunk.embedding),
                        embedding_model,
                    ),
                )
                connection.execute(
                    "INSERT INTO chunks_fts(chunk_id, content) VALUES (?, ?)",
                    (chunk_id, chunk.text),
                )
        return {
            "id": document_id,
            "filename": filename,
            "content_type": content_type,
            "source_kind": source_kind,
            "project_id": project_id,
            "chunk_count": len(chunks),
            "created_at": created_at,
            "metadata": metadata,
        }

    def list_documents(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT d.*, COUNT(c.id) AS chunk_count
                FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
                GROUP BY d.id ORDER BY d.created_at DESC
                """
            ).fetchall()
        return [self._document_summary(row) for row in rows]

    def count_documents(self) -> int:
        with self._connect() as connection:
            return int(connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0])

    def delete_document(self, document_id: str) -> bool:
        with self._connect() as connection:
            chunk_ids = [
                row[0]
                for row in connection.execute(
                    "SELECT id FROM chunks WHERE document_id = ?", (document_id,)
                ).fetchall()
            ]
            for chunk_id in chunk_ids:
                connection.execute("DELETE FROM chunks_fts WHERE chunk_id = ?", (chunk_id,))
            cursor = connection.execute("DELETE FROM documents WHERE id = ?", (document_id,))
            return cursor.rowcount > 0

    @staticmethod
    def _filters(
        project_id: str | None,
        document_ids: Sequence[str],
        params: list[Any],
        *,
        document_alias: str = "d",
    ) -> str:
        clauses: list[str] = []
        if project_id is not None:
            clauses.append(f"{document_alias}.project_id = ?")
            params.append(project_id)
        if document_ids:
            placeholders = ",".join("?" for _ in document_ids)
            clauses.append(f"{document_alias}.id IN ({placeholders})")
            params.extend(document_ids)
        return (" AND " + " AND ".join(clauses)) if clauses else ""

    def hybrid_search(
        self,
        *,
        query: str,
        query_embedding: Sequence[float],
        embedding_model: str,
        limit: int,
        project_id: str | None = None,
        document_ids: Sequence[str] = (),
    ) -> list[SearchResult]:
        query_vector = _normalize(query_embedding)
        params: list[Any] = [embedding_model]
        filters = self._filters(project_id, document_ids, params)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT c.id AS chunk_id, c.content, c.locator, c.metadata_json,
                       c.embedding, c.embedding_dim,
                       d.id AS document_id, d.filename, d.source_kind,
                       d.metadata_json AS document_metadata_json
                FROM chunks c JOIN documents d ON d.id = c.document_id
                WHERE c.embedding_model = ?
                """
                + filters,
                params,
            ).fetchall()

            vector_scores: dict[str, float] = {}
            by_id: dict[str, sqlite3.Row] = {}
            for row in rows:
                if row["embedding_dim"] != len(query_vector):
                    continue
                vector = _unpack(row["embedding"], row["embedding_dim"])
                vector_scores[row["chunk_id"]] = sum(
                    left * right for left, right in zip(query_vector, vector)
                )
                by_id[row["chunk_id"]] = row

            vector_ranked = sorted(
                vector_scores, key=vector_scores.get, reverse=True
            )[: max(limit * 8, 50)]

            tokens = re.findall(r"[^\W_]{2,}", query, flags=re.UNICODE)[:12]
            lexical_ranked: list[str] = []
            if tokens:
                match_query = " OR ".join(f'"{token.replace(chr(34), "")}"' for token in tokens)
                lexical_params: list[Any] = [match_query, embedding_model]
                lexical_filters = self._filters(
                    project_id, document_ids, lexical_params
                )
                lexical_rows = connection.execute(
                    """
                    SELECT f.chunk_id, bm25(chunks_fts) AS relevance
                    FROM chunks_fts f
                    JOIN chunks c ON c.id = f.chunk_id
                    JOIN documents d ON d.id = c.document_id
                    WHERE chunks_fts MATCH ? AND c.embedding_model = ?
                    """
                    + lexical_filters
                    + " ORDER BY relevance LIMIT ?",
                    lexical_params + [max(limit * 8, 50)],
                ).fetchall()
                lexical_ranked = [row["chunk_id"] for row in lexical_rows]

        vector_rank = {chunk_id: rank for rank, chunk_id in enumerate(vector_ranked, 1)}
        lexical_rank = {chunk_id: rank for rank, chunk_id in enumerate(lexical_ranked, 1)}
        candidate_ids = set(vector_rank) | set(lexical_rank)
        combined: list[tuple[str, float]] = []
        for chunk_id in candidate_ids:
            score = 0.0
            if chunk_id in vector_rank:
                score += 0.75 / (60 + vector_rank[chunk_id])
            if chunk_id in lexical_rank:
                score += 0.25 / (60 + lexical_rank[chunk_id])
            combined.append((chunk_id, min(1.0, score * 61)))
        combined.sort(key=lambda item: item[1], reverse=True)

        results: list[SearchResult] = []
        for chunk_id, score in combined[:limit]:
            row = by_id.get(chunk_id)
            if row is None:
                continue
            metadata = json.loads(row["document_metadata_json"])
            metadata.update(json.loads(row["metadata_json"]))
            results.append(
                SearchResult(
                    chunk_id=chunk_id,
                    document_id=row["document_id"],
                    filename=row["filename"],
                    source_kind=row["source_kind"],
                    locator=row["locator"],
                    text=row["content"],
                    score=round(score, 6),
                    metadata=metadata,
                )
            )
        return results

