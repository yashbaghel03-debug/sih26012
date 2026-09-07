# SIH 2026 — Problem Statement 26012

## AI-Based Automated Urban Parcel Mapping and Cadastral Feature Extraction System

This repository implements a deterministic GIS/WebGIS pipeline for spatial indexing, government-data integration, parcel assignment and geographic visualization.

> **Important:** the existing `mock_gov_portal` data is fictional demo data. The geographic map is now backed by real government administrative boundary geometry imported into PostGIS. Cadastral parcel polygons are not fabricated; they must be imported from an authorized state land-record/BhuNaksha dataset when available.

## Current WebGIS architecture

```text
Browser / Leaflet WebGIS
        ↓
FastAPI spatial API
        ↓
PostgreSQL + PostGIS
   ├── real India state/UT boundaries
   ├── cadastral_parcels (real source data only)
   └── viewport-generated ALU grid
        ↓
1 km → 100 m → 10 m → 1 m → 0.1 m²
```

## Real geographic data

The importer uses the Government of India's BharatMapService state boundary layer and stores its GeoJSON geometry in PostGIS with source metadata. The service is based on Survey of India administrative boundary data.

Survey of India also publishes administrative boundary databases and states that its published digital boundary data are the standard for political maps of India.

- Survey of India Online Maps: https://onlinemaps.surveyofindia.gov.in/
- Government India BharatMapService: https://mapservice.gov.in/gismapservice/rest/services/BharatMapService/Admin_Boundary_District/MapServer
- Bhu-Naksha cadastral mapping solution: https://bhunaksha.nic.in/

## Run the real WebGIS

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2. Start PostGIS

```bash
docker compose up -d postgis
```

### 3. Import real India state/UT boundaries

```bash
python -m backend.postgis.import_india_admin
```

This downloads the current features exposed by the configured Government of India GIS endpoint. The importer records `gov.in:BharatMapService` as the source.

### 4. Start FastAPI

```bash
uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

### 5. Start the frontend

```bash
python -m http.server 3000 --directory frontend
```

Open:

`http://localhost:3000/map.html`

The map uses a real OpenStreetMap basemap and requests the India boundary and visible grid from FastAPI/PostGIS. It does **not** create a full-country grid in the browser.

## Zoom-dependent spatial grid

| Zoom | Logical cell | Area |
|---|---:|---:|
| 10+ | 1000 m × 1000 m | 1 km² |
| 14+ | 100 m × 100 m | 10,000 m² |
| 17+ | 10 m × 10 m | 100 m² |
| 20+ | 1 m × 1 m | 1 m² |
| 24 | 0.1 m × 1 m | 0.1 m² |

The 0.1 m² level is the project's **logical finest indexing unit**. It is not a claim that the underlying cadastral survey has 10 cm positional accuracy.

The API generates only the current viewport cells and caps a response at 1,500 cells. This prevents a 0.1 m² full-country render from becoming computationally meaningless.

## Cadastral data policy

Real cadastral parcel geometry is state-specific. Do not replace it with rectangles, demo polygons or guessed boundaries. Put authorized state/BhuNaksha/land-record geometry into `cadastral_parcels`, preserve the source and official parcel identifier, and then expose it through a PostGIS spatial endpoint.

See [`backend/postgis/README.md`](backend/postgis/README.md) for the import workflow.

## Existing assignment pipeline

The project also contains the deterministic 21-category retrieval/normalization/resolution/scoring pipeline and the mock government portal used for controlled demonstrations. Those fixtures remain explicitly labeled as fictional demo data and are separate from the real geographic layer.

## Spatial hierarchy

The backend's deterministic lattice supports:

- `1km`
- `100m`
- `10m`
- `1m`
- `0.1m2` represented as `0.1m × 1m`

Each cell has a deterministic ID and parent/ancestor relationships.
