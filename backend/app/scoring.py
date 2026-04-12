from __future__ import annotations

import math
from typing import Iterable

import numpy as np


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0.0:
        return 0.0
    return float(np.dot(a, b) / denom)


def bounded_top_k(value: int, min_value: int = 1, max_value: int = 12) -> int:
    return max(min_value, min(max_value, value))


def diversity_penalty(
    candidate_content: np.ndarray,
    input_a_content: np.ndarray,
    input_b_content: np.ndarray,
    candidate_tags: Iterable[str],
    input_a_tags: Iterable[str],
    input_b_tags: Iterable[str],
) -> float:
    sim_to_a = cosine_similarity(candidate_content, input_a_content)
    sim_to_b = cosine_similarity(candidate_content, input_b_content)
    overlap_a = len(set(candidate_tags) & set(input_a_tags))
    overlap_b = len(set(candidate_tags) & set(input_b_tags))
    metadata_penalty = 0.03 * max(overlap_a, overlap_b)
    return -(0.6 * max(sim_to_a, sim_to_b) + metadata_penalty)


def round_score(value: float) -> float:
    if math.isnan(value) or math.isinf(value):
        return 0.0
    return round(float(value), 4)
