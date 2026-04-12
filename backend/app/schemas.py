from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ItemModel(BaseModel):
    id: str
    title: str
    source: str
    source_url: str | None = None
    modalities: list[str]
    type: str
    duration_seconds: int | None = None
    file_path: str | None = None
    thumbnail_path: str | None = None
    description: str
    is_reference_anchor: bool = False
    vibe_label: str | None = None
    tags: list[str] = Field(default_factory=list)
    content_embedding_key: str | None = None
    neural_embedding_key: str | None = None
    raw_neural_key: str | None = None
    status: str = "ready"
    queryable: bool = False
    has_raw_neural: bool = False


class QueryRequest(BaseModel):
    input_a_id: str = Field(description="Item id used for the neural axis.")
    input_b_id: str = Field(description="Item id used for the content axis.")
    candidate_ids: list[str] | None = Field(default=None, description="Optional candidate pool restriction.")
    top_k: int | None = Field(default=None, ge=1, le=12)
    alpha: float | None = Field(default=None, ge=0.0, le=1.0)
    beta: float | None = Field(default=None, ge=0.0, le=1.0)
    gamma: float | None = Field(default=None, ge=0.0, le=1.0)


class QueryResult(BaseModel):
    item: ItemModel
    total_score: float
    content_score: float
    neural_score: float
    diversity_score: float


class QueryResponse(BaseModel):
    input_a_id: str
    input_b_id: str
    input_a_item: ItemModel
    input_b_item: ItemModel
    weights: dict[str, float]
    results: list[QueryResult]


class RegionScore(BaseModel):
    name: str
    score: float


class ExplainRequest(BaseModel):
    input_a_id: str
    result_id: str
    include_vertex_data: bool = True


class VertexData(BaseModel):
    input_a_mean: list[float]
    result_mean: list[float]
    similarity: list[float]


class ExplainResponse(BaseModel):
    input_a_id: str
    result_id: str
    input_a_item: ItemModel
    result_item: ItemModel
    summary: str
    regions: list[RegionScore]
    vertex_data: VertexData | None = None
    stats: dict[str, Any]


class ActivationResponse(BaseModel):
    item_id: str
    activations: list[float]
    activations_normalized: list[float]
    stats: dict[str, Any]


class ParcellationRegion(BaseModel):
    name: str
    start: int
    stop: int
    description: str


class ParcellationResponse(BaseModel):
    regions: list[ParcellationRegion]
    total_vertices: int


class DemoQueryModel(BaseModel):
    id: str
    label: str
    description: str
    input_a_id: str
    input_b_id: str


class DemoQueriesResponse(BaseModel):
    items: list[DemoQueryModel]


class HealthResponse(BaseModel):
    status: str
    items_total: int
    references_total: int
    queryable_total: int
    content_embeddings_loaded: int
    neural_embeddings_loaded: int
    raw_neural_embeddings_loaded: int
