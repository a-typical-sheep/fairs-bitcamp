from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .schemas import (
    ActivationResponse,
    ExplainRequest,
    ExplainResponse,
    HealthResponse,
    ParcellationResponse,
    QueryRequest,
    QueryResponse,
)
from .config import settings
from .service import BackendService


app = FastAPI(
    title="Fairs Backend",
    version="0.1.0",
    description="Backend for two-input retrieval using content and neural embeddings.",
)
settings.corpus_dir.mkdir(parents=True, exist_ok=True)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/corpus", StaticFiles(directory=settings.corpus_dir), name="corpus")
service = BackendService()


@app.get("/health", response_model=HealthResponse)
def health() -> dict:
    return service.get_health()


@app.get("/items")
def items() -> dict:
    return {"items": service.get_items()}


@app.get("/items/{item_id}")
def item(item_id: str) -> dict:
    try:
        return service.get_item(item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/brain/parcellation", response_model=ParcellationResponse)
def brain_parcellation() -> dict:
    return service.get_parcellation()


@app.get("/items/{item_id}/activation", response_model=ActivationResponse)
def item_activation(item_id: str) -> dict:
    try:
        return service.get_item_activations(item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc



@app.post("/query", response_model=QueryResponse)
def query(payload: QueryRequest) -> dict:
    try:
        return service.query(
            input_a_id=payload.input_a_id,
            input_b_id=payload.input_b_id,
            candidate_ids=payload.candidate_ids,
            top_k=payload.top_k,
            alpha=payload.alpha,
            beta=payload.beta,
            gamma=payload.gamma,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/explain", response_model=ExplainResponse)
def explain(payload: ExplainRequest) -> dict:
    try:
        return service.explain(
            input_a_id=payload.input_a_id,
            result_id=payload.result_id,
            include_vertex_data=payload.include_vertex_data,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
