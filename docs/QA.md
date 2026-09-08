# Pune Demo QA

## Deterministic data

- Seed creates 24 canonical parcels.
- Re-running without `--reset` does not create duplicates.
- Re-running with `--reset` clears only the Pune demo tables and recreates the same parcel IDs and values.
- Parcel geography is never generated randomly.

## Completeness scenarios

The deterministic dataset cycles through `AVAILABLE`, `PARTIAL`, `N/D` and `N/A` status cases. The legal, planning, utilities and registration payloads also contain controlled absence/partial examples.

## Cross-source consistency

Every category record references the same canonical `parcel_id` and fictional `property_uid`. The integrated response aggregates the records rather than generating separate parcel identities per portal.

## Spatial safety

- Current seed has `geometry_status=N/D` and must never display a fabricated parcel polygon.
- Geometry ingestion accepts only GeoJSON Polygon/MultiPolygon.
- Geometry is stored in EPSG:4326.
- ALU is assigned through the existing deterministic lattice only after geometry is present.

## Portal checks

For each portal: load page, submit an empty query, search by demo parcel ID or survey/CTS/property ID, open the record, toggle API response, and verify backend errors become a readable message.

## Suggested smoke test commands

```bash
python -m backend.pune_demo.seed
uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
python -m http.server 3000 --directory frontend
```

Then test:

```text
GET http://localhost:8000/api/v1/pune-demo/health
GET http://localhost:8000/api/v1/pune-demo/parcels/PUNE-KOT-DEMO-001
GET http://localhost:8000/api/v1/search?q=PUNE-KOT-DEMO-001
```

Known current limitation: there is no verified public Kothrud parcel polygon/ULPIN import in this repository, so geometry and government ULPIN fields remain N/D.
