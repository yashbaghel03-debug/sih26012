# Pune Demo API

The Pune mock-government portals reuse the existing FastAPI application on port 8000. They do not connect directly to PostgreSQL from the browser.

## Core routes

- `GET /health` — existing project health check.
- `GET /api/v1/pune-demo/health` — Pune demo/PostGIS status.
- `POST /api/v1/pune-demo/seed` — create the deterministic 24-parcel fictional dataset.
- `GET /api/v1/parcels?q=&limit=` — canonical parcel search.
- `GET /api/v1/search?q=&service=` — universal search.
- `GET /api/v1/parcels/{parcel_id}` — integrated parcel response.
- `GET /api/v1/parcels/{parcel_id}/geometry` — parcel geometry/status.
- `GET /api/v1/parcels/{parcel_id}/alu` — ALU linkage/status.
- `GET /api/v1/parcels/{parcel_id}/land-records` — land records.
- `GET /api/v1/parcels/{parcel_id}/registration` — registration.
- `GET /api/v1/parcels/{parcel_id}/planning` — planning/building.
- `GET /api/v1/parcels/{parcel_id}/building` — building alias.
- `GET /api/v1/parcels/{parcel_id}/tax` — property tax.
- `GET /api/v1/parcels/{parcel_id}/utilities` — utilities/infrastructure.
- `GET /api/v1/parcels/{parcel_id}/legal` — legal/encumbrance.
- `GET /api/v1/parcels/{parcel_id}/all-information` — integrated view and provenance.
- `GET /api/v1/workflow/{parcel_id}` — category workflow timeline.
- `GET /api/v1/alu/{alu_id}` — deterministic ALU lookup.
- `GET /api/v1/ulpin/{ulpin}` — government ULPIN lookup; current demo returns N/D because no live ULPIN was imported.
- `GET /api/v1/sources` and `/api/v1/sources/{source_id}` — source metadata.

## Authorized geometry ingestion

`PUT /api/v1/pune-demo/parcels/{parcel_id}/geometry` accepts an authorized EPSG:4326 GeoJSON Polygon/MultiPolygon and a traceable `geometry_source`. The server stores the geometry in PostGIS and computes a deterministic 1 m² ALU using `backend/spatial_indexing/lattice.py`. It also stores the parcel-to-ALU relationship and intersection metrics.

No synthetic parcel geometry is accepted by the documented workflow.
