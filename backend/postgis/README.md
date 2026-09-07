# PostGIS WebGIS data workflow

## 1. Start PostGIS

From the repository root:

```bash
docker compose up -d postgis
```

The database is `sih26012`, user `sih`, password `sih`, port `5432`.

## 2. Import real India state/UT boundaries

The importer reads the Government of India's BharatMapService state layer and stores the returned GeoJSON geometry in PostGIS:

```bash
python -m backend.postgis.import_india_admin
```

The default source is:

`https://mapservice.gov.in/gismapservice/rest/services/BharatMapService/Admin_Boundary_District/MapServer/0/query`

The API records the source as `gov.in:BharatMapService` so the map is auditable.

## 3. Start the API

```bash
uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

Useful endpoints:

- `GET /health` — includes PostGIS status/version.
- `GET /api/v1/spatial/india-boundaries` — PostGIS state/UT features as GeoJSON.
- `GET /api/v1/spatial/grid?west=...&south=...&east=...&north=...&zoom=...` — viewport-only grid GeoJSON.

## 4. Cadastral parcels

Do **not** fabricate parcel polygons. Cadastral geometry is state-specific and should come from an authoritative land-record/BhuNaksha or other permitted state dataset.

When a real Shapefile/GeoPackage/GeoJSON is available, import it into `cadastral_parcels` with GDAL/`ogr2ogr` after mapping its official parcel identifier into `parcel_id`. Keep the original source name in `source` and preserve source attributes in `properties`.

Example pattern:

```bash
ogr2ogr -f PostgreSQL \
  PG:"host=localhost dbname=sih26012 user=sih password=sih" \
  /path/to/official_cadastral_data.gpkg \
  -nln cadastral_parcels \
  -nlt PROMOTE_TO_MULTI \
  -lco GEOMETRY_NAME=geom \
  -t_srs EPSG:4326
```

Then add a controlled ETL step to map the authority's parcel ID/state/district/village fields to the table columns.

## 5. Why the grid is API/PostGIS-backed

The browser does not fabricate a full-country grid. It sends its current geographic viewport and zoom to FastAPI. The SQL query creates only the visible cells in EPSG:3857, converts them back to EPSG:4326 GeoJSON, and caps the response at 1,500 cells.

Levels are:

- zoom 10+: 1,000 m × 1,000 m = 1 km²
- zoom 14+: 100 m × 100 m = 10,000 m²
- zoom 17+: 10 m × 10 m = 100 m²
- zoom 20+: 1 m × 1 m = 1 m²
- zoom 24: 0.1 m × 1 m = 0.1 m²

The 0.1 m² unit is an indexing resolution, not a statement that a source cadastral survey has 10 cm positional accuracy.
