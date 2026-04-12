# Cortex Commons Frontend

This frontend is wired to the backend and the real derivative demo bundle.

## Backend Requirements

The UI expects these endpoints:

- `GET /health`
- `GET /items`
- `GET /demo-queries`
- `POST /query`
- `POST /explain`
- static media under `/corpus/*`

## Run The Real Math Demo

### 1. Start the backend from the repo root

```bash
CORTEX_ITEMS_PATH=data/demo_real/items.json \
CORTEX_DEMO_QUERIES_PATH=data/demo_real/demo_queries.json \
CORTEX_CONTENT_EMBEDDINGS_PATH=data/demo_real/embeddings/content_embeddings.npz \
CORTEX_NEURAL_EMBEDDINGS_PATH=data/demo_real/embeddings/neural_embeddings_pooled.npz \
CORTEX_RAW_NEURAL_EMBEDDINGS_PATH=data/demo_real/embeddings/neural_embeddings_raw.npz \
.venv_backend/bin/uvicorn backend.app.main:app --app-dir . --reload
```

### 2. Start the frontend from `frontend/`

```bash
npm run dev
```

By default Vite proxies the backend routes to `http://127.0.0.1:8000`.

If you want to use an explicit API base URL instead, copy `.env.example` to `.env`
and set:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Current Integrated Flow

The interface is centered on the derivative demo:

- Feel anchor: `vid_walle_explained_idiot`
- About anchor: `txt_derivatives_wikipedia`
- Expected top result: `vid_fun_calculus`

The UI now displays:

- selectable input items
- real ranked retrieval results
- content / neural / diversity score breakdowns
- backend explanation output for the selected result
- video and text previews from the backend's `/corpus` static mount
