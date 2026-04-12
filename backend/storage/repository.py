from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from .db import CortexDatabase


def _to_json(value: dict[str, Any] | None) -> str:
    return json.dumps(value or {}, sort_keys=True)


class CortexRepository:
    """Repository for storing item metadata plus on-disk embedding artifacts."""

    def __init__(self, database: CortexDatabase) -> None:
        self.database = database

    def initialize(self) -> None:
        self.database.initialize()

    def upsert_item(self, item: dict[str, Any]) -> None:
        modalities = list(item.get("modalities", []))
        tags = list(item.get("tags", []))
        metadata = {
            key: value
            for key, value in item.items()
            if key
            not in {
                "id",
                "title",
                "source",
                "source_url",
                "type",
                "description",
                "duration_seconds",
                "file_path",
                "thumbnail_path",
                "excerpt_text",
                "vibe_label",
                "status",
                "is_reference_anchor",
                "content_embedding_key",
                "neural_embedding_key",
                "raw_neural_key",
                "modalities",
                "tags",
            }
        }
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT INTO items (
                    id, title, source, source_url, item_type, description,
                    duration_seconds, file_path, thumbnail_path, excerpt_text,
                    vibe_label, status, is_reference_anchor, content_embedding_key,
                    neural_embedding_key, raw_neural_key, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    source=excluded.source,
                    source_url=excluded.source_url,
                    item_type=excluded.item_type,
                    description=excluded.description,
                    duration_seconds=excluded.duration_seconds,
                    file_path=excluded.file_path,
                    thumbnail_path=excluded.thumbnail_path,
                    excerpt_text=excluded.excerpt_text,
                    vibe_label=excluded.vibe_label,
                    status=excluded.status,
                    is_reference_anchor=excluded.is_reference_anchor,
                    content_embedding_key=excluded.content_embedding_key,
                    neural_embedding_key=excluded.neural_embedding_key,
                    raw_neural_key=excluded.raw_neural_key,
                    metadata_json=excluded.metadata_json,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    item["id"],
                    item["title"],
                    item.get("source", "unknown"),
                    item.get("source_url"),
                    item.get("type", "unknown"),
                    item.get("description", ""),
                    item.get("duration_seconds"),
                    item.get("file_path"),
                    item.get("thumbnail_path"),
                    item.get("excerpt_text"),
                    item.get("vibe_label"),
                    item.get("status", "pending"),
                    1 if item.get("is_reference_anchor", False) else 0,
                    item.get("content_embedding_key"),
                    item.get("neural_embedding_key"),
                    item.get("raw_neural_key"),
                    _to_json(metadata),
                ),
            )
            connection.execute("DELETE FROM item_modalities WHERE item_id = ?", (item["id"],))
            connection.executemany(
                "INSERT INTO item_modalities (item_id, modality) VALUES (?, ?)",
                [(item["id"], modality) for modality in modalities],
            )
            connection.execute("DELETE FROM item_tags WHERE item_id = ?", (item["id"],))
            connection.executemany(
                "INSERT INTO item_tags (item_id, tag) VALUES (?, ?)",
                [(item["id"], tag) for tag in tags],
            )
            connection.commit()

    def upsert_demo_query(self, query: dict[str, Any]) -> None:
        metadata = {
            key: value
            for key, value in query.items()
            if key not in {"id", "label", "description", "input_a_id", "input_b_id"}
        }
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT INTO demo_queries (id, label, description, input_a_id, input_b_id, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    label=excluded.label,
                    description=excluded.description,
                    input_a_id=excluded.input_a_id,
                    input_b_id=excluded.input_b_id,
                    metadata_json=excluded.metadata_json,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    query["id"],
                    query["label"],
                    query["description"],
                    query["input_a_id"],
                    query["input_b_id"],
                    _to_json(metadata),
                ),
            )
            connection.commit()

    def upsert_asset(
        self,
        *,
        item_id: str,
        asset_role: str,
        path: str | Path,
        mime_type: str | None = None,
        byte_size: int | None = None,
        sha256: str | None = None,
        duration_seconds: float | None = None,
        fps: float | None = None,
        width: int | None = None,
        height: int | None = None,
        status: str = "ready",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT INTO assets (
                    item_id, asset_role, path, mime_type, byte_size, sha256,
                    duration_seconds, fps, width, height, status, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(item_id, asset_role, path) DO UPDATE SET
                    mime_type=excluded.mime_type,
                    byte_size=excluded.byte_size,
                    sha256=excluded.sha256,
                    duration_seconds=excluded.duration_seconds,
                    fps=excluded.fps,
                    width=excluded.width,
                    height=excluded.height,
                    status=excluded.status,
                    metadata_json=excluded.metadata_json,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    item_id,
                    asset_role,
                    str(path),
                    mime_type,
                    byte_size,
                    sha256,
                    duration_seconds,
                    fps,
                    width,
                    height,
                    status,
                    _to_json(metadata),
                ),
            )
            connection.commit()

    def upsert_embedding_collection(
        self,
        *,
        collection_key: str,
        embedding_kind: str,
        provider: str,
        model_name: str,
        dimensions: int,
        storage_format: str,
        storage_path: str | Path,
        manifest_path: str | Path | None = None,
        status: str = "ready",
        metadata: dict[str, Any] | None = None,
    ) -> int:
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT INTO embedding_collections (
                    collection_key, embedding_kind, provider, model_name,
                    dimensions, storage_format, storage_path, manifest_path,
                    status, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(collection_key) DO UPDATE SET
                    embedding_kind=excluded.embedding_kind,
                    provider=excluded.provider,
                    model_name=excluded.model_name,
                    dimensions=excluded.dimensions,
                    storage_format=excluded.storage_format,
                    storage_path=excluded.storage_path,
                    manifest_path=excluded.manifest_path,
                    status=excluded.status,
                    metadata_json=excluded.metadata_json,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    collection_key,
                    embedding_kind,
                    provider,
                    model_name,
                    dimensions,
                    storage_format,
                    str(storage_path),
                    str(manifest_path) if manifest_path is not None else None,
                    status,
                    _to_json(metadata),
                ),
            )
            row = connection.execute(
                "SELECT id FROM embedding_collections WHERE collection_key = ?",
                (collection_key,),
            ).fetchone()
            connection.commit()
            if row is None:
                raise RuntimeError(f"Failed to create embedding collection {collection_key}")
            return int(row["id"])

    def upsert_item_embedding(
        self,
        *,
        item_id: str,
        collection_id: int,
        embedding_key: str,
        vector_norm: float | None = None,
        time_steps: int | None = None,
        vertex_count: int | None = None,
        storage_path: str | Path | None = None,
        sha256: str | None = None,
        status: str = "ready",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT INTO item_embeddings (
                    item_id, collection_id, embedding_key, vector_norm, time_steps,
                    vertex_count, storage_path, sha256, status, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(item_id, collection_id) DO UPDATE SET
                    embedding_key=excluded.embedding_key,
                    vector_norm=excluded.vector_norm,
                    time_steps=excluded.time_steps,
                    vertex_count=excluded.vertex_count,
                    storage_path=excluded.storage_path,
                    sha256=excluded.sha256,
                    status=excluded.status,
                    metadata_json=excluded.metadata_json,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    item_id,
                    collection_id,
                    embedding_key,
                    vector_norm,
                    time_steps,
                    vertex_count,
                    str(storage_path) if storage_path is not None else None,
                    sha256,
                    status,
                    _to_json(metadata),
                ),
            )
            connection.commit()

    def upsert_processing_run(
        self,
        *,
        run_key: str,
        pipeline_name: str,
        provider: str,
        model_name: str,
        input_manifest_path: str | Path | None = None,
        output_dir: str | Path | None = None,
        status: str = "pending",
        started_at: str | None = None,
        finished_at: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> int:
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT INTO processing_runs (
                    run_key, pipeline_name, provider, model_name, input_manifest_path,
                    output_dir, status, started_at, finished_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(run_key) DO UPDATE SET
                    pipeline_name=excluded.pipeline_name,
                    provider=excluded.provider,
                    model_name=excluded.model_name,
                    input_manifest_path=excluded.input_manifest_path,
                    output_dir=excluded.output_dir,
                    status=excluded.status,
                    started_at=excluded.started_at,
                    finished_at=excluded.finished_at,
                    metadata_json=excluded.metadata_json,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    run_key,
                    pipeline_name,
                    provider,
                    model_name,
                    str(input_manifest_path) if input_manifest_path is not None else None,
                    str(output_dir) if output_dir is not None else None,
                    status,
                    started_at,
                    finished_at,
                    _to_json(metadata),
                ),
            )
            row = connection.execute(
                "SELECT id FROM processing_runs WHERE run_key = ?",
                (run_key,),
            ).fetchone()
            connection.commit()
            if row is None:
                raise RuntimeError(f"Failed to create processing run {run_key}")
            return int(row["id"])

    def upsert_run_item(
        self,
        *,
        run_id: int,
        item_id: str,
        status: str,
        message: str | None = None,
        duration_ms: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        with self.database.connect() as connection:
            connection.execute(
                """
                INSERT INTO run_items (
                    run_id, item_id, status, message, duration_ms, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(run_id, item_id) DO UPDATE SET
                    status=excluded.status,
                    message=excluded.message,
                    duration_ms=excluded.duration_ms,
                    metadata_json=excluded.metadata_json,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    run_id,
                    item_id,
                    status,
                    message,
                    duration_ms,
                    _to_json(metadata),
                ),
            )
            connection.commit()

    def list_embedding_collections(self) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, collection_key, embedding_kind, provider, model_name,
                       dimensions, storage_format, storage_path, manifest_path, status,
                       created_at, updated_at
                FROM embedding_collections
                ORDER BY created_at DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def dataset_summary(self) -> dict[str, int]:
        with self.database.connect() as connection:
            items_total = connection.execute("SELECT COUNT(*) AS count FROM items").fetchone()["count"]
            assets_total = connection.execute("SELECT COUNT(*) AS count FROM assets").fetchone()["count"]
            queries_total = connection.execute("SELECT COUNT(*) AS count FROM demo_queries").fetchone()["count"]
            embedding_rows_total = connection.execute(
                "SELECT COUNT(*) AS count FROM item_embeddings"
            ).fetchone()["count"]
            collections_total = connection.execute(
                "SELECT COUNT(*) AS count FROM embedding_collections"
            ).fetchone()["count"]
        return {
            "items_total": int(items_total),
            "assets_total": int(assets_total),
            "demo_queries_total": int(queries_total),
            "embedding_rows_total": int(embedding_rows_total),
            "embedding_collections_total": int(collections_total),
        }

    def ingest_items(self, items: Iterable[dict[str, Any]]) -> None:
        for item in items:
            self.upsert_item(item)
