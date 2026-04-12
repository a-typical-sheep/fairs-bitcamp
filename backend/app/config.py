from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    return float(value) if value is not None else default


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value is not None else default


def _env_path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    if value is None:
        return default
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = ROOT_DIR / path
    return path


@dataclass(frozen=True)
class Settings:
    root_dir: Path = _env_path("FAIRS_ROOT_DIR", ROOT_DIR)
    data_dir: Path = _env_path("FAIRS_DATA_DIR", ROOT_DIR / "data")
    corpus_dir: Path = _env_path("FAIRS_CORPUS_DIR", ROOT_DIR / "corpus")
    items_path: Path = _env_path("FAIRS_ITEMS_PATH", ROOT_DIR / "data" / "items.json")
    embeddings_dir: Path = _env_path("FAIRS_EMBEDDINGS_DIR", ROOT_DIR / "data" / "embeddings")
    content_embeddings_path: Path = _env_path(
        "FAIRS_CONTENT_EMBEDDINGS_PATH",
        ROOT_DIR / "data" / "embeddings" / "content_embeddings.npz",
    )
    neural_embeddings_path: Path = _env_path(
        "FAIRS_NEURAL_EMBEDDINGS_PATH",
        ROOT_DIR / "data" / "embeddings" / "neural_embeddings_pooled.npz",
    )
    raw_neural_embeddings_path: Path = _env_path(
        "FAIRS_RAW_NEURAL_EMBEDDINGS_PATH",
        ROOT_DIR / "data" / "embeddings" / "neural_embeddings_raw.npz",
    )
    parcellation_path: Path = _env_path("FAIRS_PARCELLATION_PATH", ROOT_DIR / "data" / "parcellation.json")
    alpha: float = _env_float("FAIRS_ALPHA", 0.4)
    beta: float = _env_float("FAIRS_BETA", 0.4)
    gamma: float = _env_float("FAIRS_GAMMA", 0.2)
    default_top_k: int = _env_int("FAIRS_TOP_K", 6)
    max_top_k: int = _env_int("FAIRS_MAX_TOP_K", 12)


settings = Settings()
