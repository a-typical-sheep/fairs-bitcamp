from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class DatabasePaths:
    db_path: Path

    @classmethod
    def from_root(cls, root: Path) -> "DatabasePaths":
        return cls(db_path=root / "data" / "fairs_commons.db")


SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    item_type TEXT NOT NULL,
    description TEXT NOT NULL,
    duration_seconds REAL,
    file_path TEXT,
    thumbnail_path TEXT,
    excerpt_text TEXT,
    vibe_label TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    is_reference_anchor INTEGER NOT NULL DEFAULT 0,
    content_embedding_key TEXT,
    neural_embedding_key TEXT,
    raw_neural_key TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_modalities (
    item_id TEXT NOT NULL,
    modality TEXT NOT NULL,
    PRIMARY KEY (item_id, modality),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS item_tags (
    item_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (item_id, tag),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    asset_role TEXT NOT NULL,
    path TEXT NOT NULL,
    mime_type TEXT,
    byte_size INTEGER,
    sha256 TEXT,
    duration_seconds REAL,
    fps REAL,
    width INTEGER,
    height INTEGER,
    status TEXT NOT NULL DEFAULT 'ready',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (item_id, asset_role, path),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS embedding_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_key TEXT NOT NULL UNIQUE,
    embedding_kind TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_name TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    storage_format TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    manifest_path TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    collection_id INTEGER NOT NULL,
    embedding_key TEXT NOT NULL,
    vector_norm REAL,
    time_steps INTEGER,
    vertex_count INTEGER,
    storage_path TEXT,
    sha256 TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (item_id, collection_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES embedding_collections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processing_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_key TEXT NOT NULL UNIQUE,
    pipeline_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_name TEXT NOT NULL,
    input_manifest_path TEXT,
    output_dir TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT,
    finished_at TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS run_items (
    run_id INTEGER NOT NULL,
    item_id TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    duration_ms INTEGER,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (run_id, item_id),
    FOREIGN KEY (run_id) REFERENCES processing_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS demo_queries (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    input_a_id TEXT NOT NULL,
    input_b_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (input_a_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (input_b_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_assets_item_id ON assets(item_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_item_id ON item_embeddings(item_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_collection_id ON item_embeddings(collection_id);
CREATE INDEX IF NOT EXISTS idx_runs_pipeline_name ON processing_runs(pipeline_name);
CREATE INDEX IF NOT EXISTS idx_run_items_status ON run_items(status);
"""


class fairsDatabase:
    """Small SQLite wrapper for metadata and artifact indexing."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(SCHEMA_SQL)
            connection.commit()
