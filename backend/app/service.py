from __future__ import annotations

from typing import Any

from .config import Settings, settings
from .data_store import DataStore
from .scoring import bounded_top_k, cosine_similarity, diversity_penalty, round_score


class BackendService:
    def __init__(self, store: DataStore | None = None, cfg: Settings | None = None) -> None:
        self.settings = cfg or settings
        self.store = store or DataStore(cfg=self.settings)

    def get_health(self) -> dict[str, Any]:
        return self.store.get_health_summary()

    def get_items(self) -> list[dict[str, Any]]:
        return self.store.list_public_items()

    def get_item(self, item_id: str) -> dict[str, Any]:
        return self.store.get_public_item(item_id)

    def get_item_activations(self, item_id: str) -> dict[str, Any]:
        return self.store.item_activations(item_id)

    def get_parcellation(self) -> dict[str, Any]:
        return self.store.parcellation()

    def query(
        self,
        input_a_id: str,
        input_b_id: str,
        candidate_ids: list[str] | None = None,
        top_k: int | None = None,
        alpha: float | None = None,
        beta: float | None = None,
        gamma: float | None = None,
    ) -> dict[str, Any]:
        if input_a_id == input_b_id:
            raise ValueError("input_a_id and input_b_id must be different items.")

        input_a = self.store.require_item(input_a_id)
        input_b = self.store.require_item(input_b_id)

        requested_top_k = top_k if top_k is not None else self.settings.default_top_k
        requested_top_k = bounded_top_k(requested_top_k, max_value=self.settings.max_top_k)
        resolved_alpha = self.settings.alpha if alpha is None else alpha
        resolved_beta = self.settings.beta if beta is None else beta
        resolved_gamma = self.settings.gamma if gamma is None else gamma

        input_a_neural = self.store.require_neural_embedding(input_a_id)
        input_a_content = self.store.require_content_embedding(input_a_id)
        input_b_content = self.store.require_content_embedding(input_b_id)

        if candidate_ids:
            candidate_pool = [candidate_id for candidate_id in candidate_ids if candidate_id in self.store.queryable_ids]
        else:
            candidate_pool = list(self.store.queryable_ids)

        results: list[dict[str, Any]] = []
        for candidate_id in candidate_pool:
            if candidate_id in {input_a_id, input_b_id}:
                continue

            candidate = self.store.require_item(candidate_id)
            if candidate.raw.get("is_candidate") is False:
                continue
            candidate_content = self.store.require_content_embedding(candidate_id)
            candidate_neural = self.store.require_neural_embedding(candidate_id)

            content_score = cosine_similarity(input_b_content, candidate_content)
            neural_score = cosine_similarity(input_a_neural, candidate_neural)
            diversity_score = diversity_penalty(
                candidate_content=candidate_content,
                input_a_content=input_a_content,
                input_b_content=input_b_content,
                candidate_tags=candidate.tags,
                input_a_tags=input_a.tags,
                input_b_tags=input_b.tags,
            )
            total_score = (
                resolved_alpha * content_score
                + resolved_beta * neural_score
                + resolved_gamma * diversity_score
            )
            results.append(
                {
                    "item": self.store.get_public_item(candidate_id),
                    "total_score": round_score(total_score),
                    "content_score": round_score(content_score),
                    "neural_score": round_score(neural_score),
                    "diversity_score": round_score(diversity_score),
                }
            )

        results.sort(key=lambda item: item["total_score"], reverse=True)

        return {
            "input_a_id": input_a_id,
            "input_b_id": input_b_id,
            "input_a_item": self.store.get_public_item(input_a_id),
            "input_b_item": self.store.get_public_item(input_b_id),
            "weights": {
                "alpha": resolved_alpha,
                "beta": resolved_beta,
                "gamma": resolved_gamma,
            },
            "results": results[:requested_top_k],
        }

    def explain(self, input_a_id: str, result_id: str, include_vertex_data: bool = True) -> dict[str, Any]:
        input_a = self.store.require_item(input_a_id)
        result = self.store.require_item(result_id)
        region_scores = self.store.region_scores(input_a_id, result_id)
        top_regions = region_scores[:3]
        if len(top_regions) < 3:
            region_names = [row["name"] for row in top_regions]
            summary_tail = ", ".join(region_names) if region_names else "no available regions"
        else:
            summary_tail = (
                f"{top_regions[0]['name']}, {top_regions[1]['name']}, and {top_regions[2]['name']}"
            )

        tone = input_a.raw.get("vibe_label") or "the reference item's"
        result_title = result.raw["title"]
        summary = (
            f"{result_title} matches the {tone.lower()} neural profile most strongly in {summary_tail}."
        )

        return {
            "input_a_id": input_a_id,
            "result_id": result_id,
            "input_a_item": self.store.get_public_item(input_a_id),
            "result_item": self.store.get_public_item(result_id),
            "summary": summary,
            "regions": top_regions,
            "vertex_data": self.store.vertex_payload(input_a_id, result_id) if include_vertex_data else None,
            "stats": {
                "top_region_score": top_regions[0]["score"],
                "all_region_scores": region_scores,
            },
        }
