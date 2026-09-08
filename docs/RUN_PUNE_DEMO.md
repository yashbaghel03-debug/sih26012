# Run the Pune Mock Government Portal Suite

## 1. Start PostGIS

```bash
docker compose up -d postgis
```

## 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

## 3. Seed the deterministic fictional dataset

```bash
python -m backend.pune_demo.seed
```

Reset only the Pune demo tables with:

```bash
python -m backend.pune_demo.seed --reset
```

Expected seed size: **24 canonical parcels** and **6 source records per parcel**. No parcel polygon or live ULPIN is generated.

## 4. Start FastAPI

```bash
uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

Check:

```text
http://localhost:8000/api/v1/pune-demo/health
http://localhost:8000/docs
```

## 5. Start the frontend

```bash
python -m http.server 3000 --directory frontend
```

Open the portal suite:

```text
http://localhost:3000/mock_government_portals/
```

Or open a portal directly:

```text
/mock_government_portals/land_records/
/mock_government_portals/registration/
/mock_government_portals/planning_building/
/mock_government_portals/property_tax/
/mock_government_portals/utilities_infrastructure/
/mock_government_portals/legal_encumbrance/
/mock_government_portals/citizen_land_services/
```

## Demo search values

- Parcel ID: `PUNE-KOT-DEMO-001`
- Property UID: `DEMOUID00000001`
- Survey: `D-68/1`
- CTS: `K-D0200`
- Locality: `Kothrud`

All values above are fictional demo identifiers except the real geographic context (Pune / Kothrud).

## Geometry/ALU linkage

The seed intentionally leaves parcel geometry and government ULPIN as N/D. Once an authorized/public cadastral Polygon/MultiPolygon is available, send it to:

```http
PUT /api/v1/pune-demo/parcels/PUNE-KOT-DEMO-001/geometry
Content-Type: application/json

{
  "geometry": {"type":"Polygon","coordinates":[...]},
  "geometry_source":"AUTHORIZED_SOURCE_REFERENCE"
}
```

The backend stores the geometry in PostGIS and computes an ALU using the existing deterministic `backend/spatial_indexing/lattice.py` implementation.
