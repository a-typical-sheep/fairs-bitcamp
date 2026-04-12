from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from .config import Settings, settings


REGION_NAMES = [
    "Visual Cortex",
    "Auditory Cortex",
    "Language Network",
    "Default Mode Network",
    "Attention Network",
    "Motor Cortex",
    "Salience Network",
    "Association Cortex",
]

REGION_DESCRIPTIONS: dict[str, str] = {
    "Visual Cortex": "Processes what you see — shape, motion, color, and scene layout. Strong activation here means the content carried rich visual information.",
    "Auditory Cortex": "Processes sound — pitch, rhythm, timbre, and speech. Strong activation suggests the audio track drove engagement.",
    "Language Network": "Handles word meaning, grammar, and narrative structure. Activation indicates linguistic content was prominent.",
    "Default Mode Network": "Engages during self-referential thought, memory recall, and mind-wandering. Activation hints at introspective or narrative resonance.",
    "Attention Network": "Directs focused attention and cognitive control. Activation suggests the content demanded sustained concentration.",
    "Motor Cortex": "Plans and simulates movement. Often activated while watching physical action or rhythmic motion.",
    "Salience Network": "Detects what is emotionally or perceptually important. Flags moments that stand out from the surrounding stream.",
    "Association Cortex": "Integrates information across senses, memory, and meaning. Activation suggests complex, high-level synthesis.",
}


def _load_npz(path: Path) -> dict[str, np.ndarray]:
    if not path.exists():
        return {}
    payload = np.load(path, allow_pickle=False)
    return {key: payload[key] for key in payload.files}


def _load_parcellation(path: Path, total_vertices: int = 20484) -> dict[str, slice]:
    if not path.exists():
        return _vertex_slices(total_vertices=total_vertices)
    payload = json.loads(path.read_text(encoding="utf-8"))
    output: dict[str, slice] = {}
    for region_name, bounds in payload.items():
        start = int(bounds["start"])
        stop = int(bounds["stop"])
        output[region_name] = slice(start, stop)
    return output


def _vertex_slices(total_vertices: int = 20484) -> dict[str, slice]:
    base_lengths = [3200, 2200, 2800, 2600, 2600, 1800, 2200]
    used = sum(base_lengths)
    base_lengths.append(total_vertices - used)
    start = 0
    output: dict[str, slice] = {}
    for name, length in zip(REGION_NAMES, base_lengths):
        output[name] = slice(start, start + length)
        start += length
    return output


@dataclass
class ItemRecord:
    raw: dict[str, Any]

    @property
    def id(self) -> str:
        return self.raw["id"]

    @property
    def tags(self) -> list[str]:
        return list(self.raw.get("tags", []))

    def to_public_dict(self) -> dict[str, Any]:
        return dict(self.raw)


class DataStore:
    def __init__(self, cfg: Settings | None = None) -> None:
        self.settings = cfg or settings
        self.vertex_slices = _load_parcellation(self.settings.parcellation_path)
        self.items = self._load_items(self.settings.items_path)
        self.items_by_id = {item.id: item for item in self.items}
        self.content_embeddings = _load_npz(self.settings.content_embeddings_path)
        self.neural_embeddings = _load_npz(self.settings.neural_embeddings_path)
        self.raw_neural_embeddings = _load_npz(self.settings.raw_neural_embeddings_path)
        self.queryable_ids = sorted(
            set(self.items_by_id)
            & set(self.content_embeddings)
            & set(self.neural_embeddings)
        )

    def _load_items(self, path: Path) -> list[ItemRecord]:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return [ItemRecord(raw=item) for item in payload]

    def require_item(self, item_id: str) -> ItemRecord:
        try:
            return self.items_by_id[item_id]
        except KeyError as exc:
            raise KeyError(f"Unknown item id: {item_id}") from exc

    def require_content_embedding(self, item_id: str) -> np.ndarray:
        try:
            return self.content_embeddings[item_id]
        except KeyError as exc:
            raise KeyError(f"Missing content embedding for item: {item_id}") from exc

    def require_neural_embedding(self, item_id: str) -> np.ndarray:
        try:
            return self.neural_embeddings[item_id]
        except KeyError as exc:
            raise KeyError(f"Missing neural embedding for item: {item_id}") from exc

    def require_raw_neural(self, item_id: str) -> np.ndarray:
        try:
            return self.raw_neural_embeddings[item_id]
        except KeyError as exc:
            raise KeyError(f"Missing raw neural embedding for item: {item_id}") from exc

    def get_public_item(self, item_id: str) -> dict[str, Any]:
        item = self.require_item(item_id)
        payload = item.to_public_dict()
        payload["queryable"] = item_id in self.queryable_ids
        payload["has_raw_neural"] = item_id in self.raw_neural_embeddings
        return payload

    def list_public_items(self) -> list[dict[str, Any]]:
        items = [self.get_public_item(item.id) for item in self.items]
        return sorted(items, key=lambda item: item["title"])

    def get_health_summary(self) -> dict[str, int | str]:
        return {
            "status": "ok",
            "items_total": len(self.items),
            "references_total": sum(item.is_reference_anchor for item in self.items),
            "queryable_total": len(self.queryable_ids),
            "content_embeddings_loaded": len(self.content_embeddings),
            "neural_embeddings_loaded": len(self.neural_embeddings),
            "raw_neural_embeddings_loaded": len(self.raw_neural_embeddings),
        }

    def region_scores(self, input_a_id: str, result_id: str) -> list[dict[str, float | str]]:
        a = self.require_raw_neural(input_a_id).mean(axis=0)
        b = self.require_raw_neural(result_id).mean(axis=0)
        scores: list[dict[str, float | str]] = []
        for region_name, region_slice in self.vertex_slices.items():
            region_a = a[region_slice]
            region_b = b[region_slice]
            denom = float(np.linalg.norm(region_a) * np.linalg.norm(region_b))
            score = 0.0 if denom == 0.0 else float(np.dot(region_a, region_b) / denom)
            scores.append({"name": region_name, "score": round(score, 4)})
        scores.sort(key=lambda item: item["score"], reverse=True)
        return scores

    def vertex_payload(self, input_a_id: str, result_id: str) -> dict[str, list[float]]:
        a = self.require_raw_neural(input_a_id).mean(axis=0).astype(np.float32)
        b = self.require_raw_neural(result_id).mean(axis=0).astype(np.float32)
        a_norm = np.linalg.norm(a)
        b_norm = np.linalg.norm(b)
        if a_norm != 0:
            a = a / a_norm
        if b_norm != 0:
            b = b / b_norm
        similarity = a * b
        return {
            "input_a_mean": a.tolist(),
            "result_mean": b.tolist(),
            "similarity": similarity.tolist(),
        }

    def parcellation(self) -> dict[str, Any]:
        regions = []
        for name, region_slice in self.vertex_slices.items():
            regions.append(
                {
                    "name": name,
                    "start": int(region_slice.start),
                    "stop": int(region_slice.stop),
                    "description": REGION_DESCRIPTIONS.get(
                        name,
                        "High-level cortical region — activation here indicates this content engaged it.",
                    ),
                }
            )
        regions.sort(key=lambda r: r["start"])
        total_vertices = regions[-1]["stop"] if regions else 0
        return {"regions": regions, "total_vertices": int(total_vertices)}

    def item_activations(self, item_id: str) -> dict[str, Any]:
        raw = self.require_raw_neural(item_id)
        mean = raw.mean(axis=0).astype(np.float32)

        magnitude = np.abs(mean)
        if magnitude.size > 0:
            lo = float(np.percentile(magnitude, 1.0))
            hi = float(np.percentile(magnitude, 99.0))
        else:
            lo, hi = 0.0, 1.0
        denom = hi - lo
        if denom <= 0.0:
            normalized = np.zeros_like(magnitude)
        else:
            normalized = np.clip((magnitude - lo) / denom, 0.0, 1.0)

        return {
            "item_id": item_id,
            "activations": mean.tolist(),
            "activations_normalized": normalized.astype(np.float32).tolist(),
            "stats": {
                "vertex_count": int(mean.shape[0]),
                "time_windows": int(raw.shape[0]),
                "mean_min": float(mean.min()),
                "mean_max": float(mean.max()),
                "mean_abs_mean": float(magnitude.mean()),
                "clip_low": lo,
                "clip_high": hi,
            },
        }
