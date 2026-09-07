# SIH 2026 WebGIS Frontend

This is the browser dashboard for Problem Statement 26012. It is intentionally dependency-free: HTML, CSS and JavaScript call the Phase 9 FastAPI backend directly.

## Run the complete demo

From the repository root:

```bash
# terminal 1 — mock government portal
uvicorn backend.mock_gov_portal.main:app --host 0.0.0.0 --port 8001

# terminal 2 — Phase 9 API
uvicorn backend.api.main:app --host 0.0.0.0 --port 8000

# terminal 3 — frontend
python -m http.server 3000 --directory frontend
```

Open `http://localhost:3000` in the browser.

The dashboard automatically connects to `http://localhost:8000`. The API URL can also be changed in the **API Connection** field.

## What is visible

- 5 demo parcels and parcel metadata
- 21-category retrieval matrix
- normalized value/status/source/timestamp fields
- N/A vs N/D distinction
- usable count and green/yellow/red assignment
- deterministic spatial cell inspection and 1 km ancestor
- round processing from 1km through 0.1m²
- end-to-end architecture flow

The frontend is a presentation/client layer; retrieval, normalization, resolution, scoring, spatial indexing and round processing remain in Python.
