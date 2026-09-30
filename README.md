<div align="center">

<img src="frontend/public/Fairs.png" alt="FAIRS logo" width="200" />

# FAIRS — Feel-Aware Information Retrieval System

**A neuroscience-inspired search engine that retrieves media by _how it feels_, not just what it's about.**

Built at [Bitcamp](https://bit.camp/) 2025 · University of Maryland

[![Python](https://img.shields.io/badge/Python-3.11+-3776ab?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=black)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-r183-000?logo=threedotjs&logoColor=white)](https://threejs.org)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-003b57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-d7c29c)](LICENSE)

</div>

---

## Table of Contents

- [Project Overview & Motivation](#project-overview--motivation)
- [Key Features](#key-features)
- [Tech Stack & Architecture](#tech-stack--architecture)
  - [Languages & Frameworks](#languages--frameworks)
  - [Libraries & Packages](#libraries--packages)
  - [High-Level Architecture](#high-level-architecture)
- [Directory Structure](#directory-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Installation & Local Setup](#installation--local-setup)
- [How to Run](#how-to-run)
- [API Reference](#api-reference)
- [Known Limitations & Future Roadmap](#known-limitations--future-roadmap)
- [Contributors](#contributors)
- [License](#license)

---

## Project Overview & Motivation

Traditional media search engines match primarily on **keywords and surface metadata** — searching for "melancholy piano" surfaces media tagged with those exact terms. However, human experience of music, art, and cinema is deeply emotional and visceral. What if you could search media by *the way content stimulates the human brain*?

**FAIRS (Feel-Aware Information Retrieval System)** is a dual-axis retrieval engine that fuses two distinct representations:

1. **Content Embeddings** — standard semantic similarity representing what media is *about* (topics, objects, genre tags).
2. **Neural Embeddings** — brain-response vectors derived from fMRI cortical activation profiles representing how media *feels* (emotional valence, affective tension, sensory resonance).

Users specify two reference anchors — an emotional "Feel" anchor and a topical "About" anchor. FAIRS fuses both vectors using a tunable tri-component scoring objective (content similarity, neural similarity, and diversity penalty), returning ranked results alongside an interactive **3D WebGL brain visualization** (20,484-vertex cortical surface) that renders the specific cortical regions driving the retrieval score.

This project was conceived and built during **Bitcamp 2025** at the University of Maryland.

---

## Key Features

- **Dual-Input Query Engine** — Pair an affective reference ("Feel") with a semantic reference ("About") to locate cross-modal matches that fit both criteria.
- **Configurable Scoring Weights** — Dynamically adjust $\alpha$ (content weight), $\beta$ (neural weight), and $\gamma$ (diversity penalty) in real time.
- **Interactive 3D Cortical Visualization** — Rendered via Three.js and OrbitControls over a 20,484-vertex FreeSurfer cortical surface with dynamic vertex colormapping.
- **Region-Level Explainability** — The `/explain` endpoint decomposes neural match scores across 8 canonical anatomical/functional networks:
  - Visual Cortex
  - Auditory Cortex
  - Language Network
  - Default Mode Network (DMN)
  - Attention Network
  - Motor Cortex
  - Salience Network
  - Association Cortex
- **Interactive Tooltips** — Hover over cortical regions in 3D space to inspect network labels, real-time activation intensity, and functional descriptions; click to lock/pin.
- **Per-Item Neural Activation Maps** — Inspect raw, normalized per-vertex activation signatures for any catalog item.
- **File Upload Capability** — Ingest media references (images, audio, video, text) directly via the frontend search interface.
- **Guided 4-Step User Workflow** — *Choose Feel &rarr; Choose About &rarr; Review Matches &rarr; Explore Cortical Activations*.
- **Integrated Static Corpus Serving** — Directly serve video clips, audio samples, and thumbnails through FastAPI static mounts.
- **SQLite Persistence with WAL Mode** — Relational schema for items, embeddings, demo queries, and metadata runs with high-concurrency WAL logging.

---

## Tech Stack & Architecture

### Languages & Frameworks

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite 7 | Fast reactive UI with modular component hierarchy |
| **Styling** | Tailwind CSS 3, PostCSS | Modern utility-first responsive interface |
| **3D Rendering** | Three.js (r183), OrbitControls | WebGL hardware-accelerated cortical mesh renderer |
| **Backend** | Python 3.11+, FastAPI | High-performance asynchronous REST API |
| **Database** | SQLite 3 (WAL mode) | Low-latency local storage with ACID compliance |

### Libraries & Packages

| Package | Ecosystem | Role |
| :--- | :--- | :--- |
| `numpy` | Python | Cosine similarity calculations, vector pooling, vertex colormapping |
| `pydantic` | Python | Strict request/response validation and serialization schemas |
| `uvicorn` | Python | High-throughput ASGI server execution |
| `three` | JavaScript | 3D scene management, shaders, vertex color attributes, and camera controls |
| `lucide-react` | JavaScript | Iconography for search controls, brain toggles, and metadata panels |
| `react` / `react-dom` | JavaScript | Core declarative UI component model |

### High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Browser                                 │
│                                                                             │
│   ┌──────────────────┐    ┌───────────────────┐    ┌───────────────────┐    │
│   │    Search Bar    │    │   Result Cards    │    │  3D Brain Viewer  │    │
│   │ (Feel & About)   │    │  & Explain Panel  │    │  (Three.js Mesh)  │    │
│   └─────────┬────────┘    └─────────┬─────────┘    └─────────┬─────────┘    │
│             │                       │                        │              │
│             └───────────────────────┼────────────────────────┘              │
│                                     │ Vite Proxy (:5173 -> :8011)           │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │     FastAPI Backend     │
                         │       (Port 8011)       │
                         ├─────────────────────────┤
                         │  /query                 │──→ Dual-axis scoring
                         │  /explain               │──→ 8-network decomposition
                         │  /items                 │──→ Catalog metadata
                         │  /items/:id/activation  │──→ Per-vertex heatmaps
                         │  /brain/parcellation    │──→ Cortical boundaries
                         │  /corpus/*              │──→ Static media assets
                         └────────────┬────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
     ┌──────▼──────┐           ┌──────▼──────┐           ┌──────▼──────┐
     │ items.json  │           │ .npz Stores │           │ SQLite (WAL)│
     │  (Catalog)  │           │  - Content  │           │   fairs_    │
     │             │           │  - Neural   │           │  commons.db │
     │             │           │  - Raw Act. │           │             │
     └─────────────┘           └─────────────┘           └─────────────┘
```

---

## Directory Structure

```text
fairs-bitcamp/
├── backend/
│   ├── app/
│   │   ├── __init__.py           # Module initializer
│   │   ├── config.py             # Environment configuration & default hyperparams
│   │   ├── data_store.py         # Memory-mapped vectors & activation algorithms
│   │   ├── main.py               # FastAPI route definitions, CORS, & static mounts
│   │   ├── schemas.py            # Pydantic schemas for queries, items, & explain
│   │   ├── scoring.py            # Dual-axis similarity & diversity scoring engine
│   │   └── service.py            # Retrieval business logic & explain orchestrator
│   └── storage/
│       ├── __init__.py           # Storage package exports (FairsDatabase, Repo)
│       ├── db.py                 # SQLite schema initialization (DDL) & connection
│       └── repository.py         # Repository queries for items, runs, & embeddings
├── frontend/
│   ├── public/
│   │   ├── brain_mesh.json       # 20,484-vertex FreeSurfer cortical surface geometry
│   │   ├── Fairs.png             # Official FAIRS emblem logo
│   │   ├── favicon.svg           # Application tab favicon
│   │   └── icons.svg             # SVG icon sprite sheet
│   ├── src/
│   │   ├── App.jsx               # Primary application UI, step controls, & state
│   │   ├── App.css               # Application custom utility styling
│   │   ├── BrainViz.jsx          # Three.js WebGL canvas rendering cortical heatmap
│   │   ├── index.css             # Tailwind base directives & component styles
│   │   ├── main.jsx              # React client root mount
│   │   └── assets/               # Branding graphics & hero media
│   ├── index.html                # HTML entry point
│   ├── package.json              # Frontend manifest & NPM dependencies
│   ├── vite.config.js            # Vite build configuration & backend proxy routing
│   ├── tailwind.config.js        # Tailwind layout tokens & theme extensions
│   ├── postcss.config.js         # CSS PostProcessor configuration
│   └── eslint.config.js          # ESLint code quality rules
└── README.md                     # Project documentation
```

---

## Prerequisites

Ensure you have the following installed on your host system:

| Tool | Minimum Version | Recommended Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Python** | 3.11 | 3.11.x or 3.12.x | Backend API runtime & scientific math |
| **Node.js** | 18.0.0 | 20.x LTS | Frontend build environment |
| **npm** | 9.0.0 | 10.x | Node package management |
| **Git** | 2.30+ | Latest | Distributed version control |

---

## Environment Variables

The backend loads configuration from environment variables defined in `backend/app/config.py`. For local development, default values match the standard project layout:

| Variable | Type | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `FAIRS_ROOT_DIR` | Path | Auto-detected project root | Base directory for path resolution |
| `FAIRS_DATA_DIR` | Path | `<root>/data` | Directory containing manifests and matrices |
| `FAIRS_CORPUS_DIR` | Path | `<root>/corpus` | Directory containing media files (audio/video) |
| `FAIRS_ITEMS_PATH` | Path | `<root>/data/items.json` | Catalog metadata file |
| `FAIRS_EMBEDDINGS_DIR` | Path | `<root>/data/embeddings` | Storage folder for `.npz` vector arrays |
| `FAIRS_CONTENT_EMBEDDINGS_PATH` | Path | `<root>/data/embeddings/content_embeddings.npz` | Content embedding vectors |
| `FAIRS_NEURAL_EMBEDDINGS_PATH` | Path | `<root>/data/embeddings/neural_embeddings_pooled.npz` | Pooled neural vectors (fMRI responses) |
| `FAIRS_RAW_NEURAL_EMBEDDINGS_PATH` | Path | `<root>/data/embeddings/neural_embeddings_raw.npz` | Per-vertex raw cortical activations |
| `FAIRS_PARCELLATION_PATH` | Path | `<root>/data/parcellation.json` | Network boundary mapping definitions |
| `FAIRS_ALPHA` | Float | `0.4` | Default content similarity weight ($\alpha$) |
| `FAIRS_BETA` | Float | `0.4` | Default neural similarity weight ($\beta$) |
| `FAIRS_GAMMA` | Float | `0.2` | Default diversity penalty weight ($\gamma$) |
| `FAIRS_TOP_K` | Int | `6` | Default number of ranked results returned |
| `FAIRS_MAX_TOP_K` | Int | `12` | Maximum allowable results per query |
| `VITE_API_BASE_URL` | String | `""` (empty string) | Custom API URL override (empty uses Vite proxy) |

---

## Installation & Local Setup

### 1. Clone the Repository

```bash
# Clone the repository (or your fork)
git clone https://github.com/rkohnmn/fairs-bitcamp.git
cd fairs-bitcamp
```

### 2. Set Up Python Virtual Environment

```bash
# Create a virtual environment
python -m venv .venv

# Activate environment:
# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Windows (Command Prompt):
.venv\Scripts\activate.bat
# On macOS / Linux:
source .venv/bin/activate

# Install required dependencies
pip install fastapi uvicorn numpy pydantic
```

### 3. Verify or Populate Data Assets

Verify that the `data/` directory contains required files:

```text
data/
├── items.json
├── parcellation.json
└── embeddings/
    ├── content_embeddings.npz
    ├── neural_embeddings_pooled.npz
    └── neural_embeddings_raw.npz
```

### 4. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

---

## How to Run

### Step 1: Start Backend API Server

In your first terminal (with `.venv` activated):

```bash
# Run from repository root
uvicorn backend.app.main:app --host 127.0.0.1 --port 8011 --reload
```

The FastAPI Swagger docs will be accessible at: `http://127.0.0.1:8011/docs`

### Step 2: Start Frontend Development Server

In your second terminal:

```bash
cd frontend
npm run dev
```

The Vite dev server will launch at: **`http://localhost:5173`** (proxying `/query`, `/explain`, `/items`, etc., directly to port 8011).

---

## API Reference

### Endpoints Overview

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Verify server status and count loaded items/embeddings |
| `GET` | `/items` | Retrieve list of all available items in corpus |
| `GET` | `/items/{item_id}` | Retrieve specific item metadata |
| `GET` | `/items/{item_id}/activation` | Fetch normalized per-vertex cortical activation array |
| `GET` | `/brain/parcellation` | Fetch 3D cortical parcellation regions and coordinate indices |
| `POST` | `/query` | Execute dual-axis retrieval with content and neural fusion |
| `POST` | `/explain` | Decompose neural similarity across 8 functional brain networks |

### Example Query Request

```bash
curl -X POST http://127.0.0.1:8011/query \
  -H "Content-Type: application/json" \
  -d '{
    "input_a_id": "clip-melancholy-rain",
    "input_b_id": "clip-jazz-history",
    "top_k": 6,
    "alpha": 0.4,
    "beta": 0.4,
    "gamma": 0.2
  }'
```

### Example Explain Request

```bash
curl -X POST http://127.0.0.1:8011/explain \
  -H "Content-Type: application/json" \
  -d '{
    "query_id": "clip-melancholy-rain",
    "target_id": "clip-nocturne-solitude"
  }'
```

---

## Known Limitations & Future Roadmap

### Current Limitations

- **Static Vector Store** — Vectors are loaded into memory from static `.npz` files at launch rather than using a streaming vector DB (e.g., Milvus or Qdrant).
- **Single Cortical Hemisphere** — The WebGL surface mesh models 20,484 vertices representing the left cortical hemisphere.
- **Fixed Parcellation Schema** — Networks are currently partitioned by contiguous vertex index bins rather than dynamic FreeSurfer atlas registrations.
- **Local Hackathon Scope** — Multi-tenancy, authentication, and background worker queues were omitted for the 24-hour sprint.

### Roadmap

- [ ] **Bilateral Mesh Representation** — Expand Three.js rendering to bilateral cortical surfaces (both left and right hemispheres).
- [ ] **Dynamic Live Ingestion Pipeline** — Add background workers to process raw uploaded audio/video files and compute embeddings on the fly.
- [ ] **Atlas-Aligned Parcellations** — Integrate Desikan-Killiany (DK) and HCP-MMP atlas boundaries for clinical-grade anatomical mapping.
- [ ] **Containerized Deployment** — Provide a `docker-compose.yml` to orchestrate FastAPI, Vite production build, and reverse proxy in a single command.
- [ ] **Automated Test Coverage** — Implement end-to-end integration tests using `pytest` for backend scoring and `vitest` for React components.

---

## Contributors

- **Robert T Kohn** ([@rkohnmn](https://github.com/rkohnmn))
- **Harshil Vejendla** ([@a-typical-sheep](https://github.com/a-typical-sheep))

Built with passion at **Bitcamp 2025** · University of Maryland.

---

## License

This project is licensed under the [MIT License](LICENSE).