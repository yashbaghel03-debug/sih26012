"""FastAPI API for assignment, PostGIS-backed WebGIS and ALU hierarchy."""
from __future__ import annotations
import json
import os
import ssl
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import psycopg2
from ..mock_gov_portal.fixtures.loader import list_all_parcels, load_parcel
from ..retrieval_engine.engine import assignment_summary
from ..retrieval_engine.engine_v2 import retrieve_parcel
from ..retrieval_engine.normalizer import to_standard_schema
from ..retrieval_engine.rounds import RoundCell, RoundProcessor
from ..spatial_indexing.lattice import LEVEL_ORDER, LEVEL_SPECS, Cell, ancestor_1km, cell_from_id, children
from ..pune_demo.api import router as pune_demo_router

MOCK_PORTAL_URL = os.environ.get("MOCK_PORTAL_URL", "http://localhost:8001")
# Local development keeps the Docker/PostGIS default. Vercel intentionally does not
# try localhost:5432 because serverless functions do not share the developer's DB.
POSTGIS_DSN = (
    os.environ.get("POSTGIS_DSN")
    or os.environ.get("DATABASE_URL")
    or ("" if os.environ.get("VERCEL") else "dbname=sih26012 user=sih password=sih host=localhost port=5432")
)
OFFICIAL_INDIA_BOUNDARY_QUERY = os.environ.get("OFFICIAL_INDIA_BOUNDARY_QUERY", "https://mapservice.gov.in/mapserviceserv176/rest/services/India_Boundary/MapServer/0/query")
FALLBACK_INDIA_BOUNDARY_URL = os.environ.get("FALLBACK_INDIA_BOUNDARY_URL", "https://pub-0429b8e3b5a946e69ea007df844a6f1c.r2.dev/reference/india_boundary.geojson")
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_FILE)

DEFAULT_SITE_CONFIGS = [
    {"id": "land_records", "name": "Land Records / RoR", "base_url": "http://localhost:8001", "api_key": "", "enabled": True},
    {"id": "registration", "name": "Property Registration", "base_url": "http://localhost:8001", "api_key": "", "enabled": True},
    {"id": "planning_building", "name": "Planning & Building", "base_url": "http://localhost:8001", "api_key": "", "enabled": True},
    {"id": "property_tax", "name": "Property Tax & Valuation", "base_url": "http://localhost:8001", "api_key": "", "enabled": True},
    {"id": "utilities_infrastructure", "name": "Utilities & Infrastructure", "base_url": "http://localhost:8001", "api_key": "", "enabled": True},
    {"id": "legal_encumbrance", "name": "Legal / Encumbrance", "base_url": "http://localhost:8001", "api_key": "", "enabled": True},
    {"id": "citizen_land_services", "name": "Citizen Land Services", "base_url": "http://localhost:8001", "api_key": "", "enabled": True},
]

app = FastAPI(title="SIH 2026 Parcel Assignment + WebGIS API", version="6.3.1", description="Hierarchical ALU indexing with PostGIS-backed India WebGIS and Pune mock-government integration.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"], allow_origin_regex=r"https://.*\.app\.github\.dev", allow_credentials=True, allow_methods=["GET", "POST", "PUT"], allow_headers=["*"])
app.include_router(pune_demo_router)


def _normalize_site_config(site: dict):
    if not isinstance(site, dict):
        raise ValueError("Each site config must be an object")
    site_id = str(site.get("id", "")).strip()
    if not site_id:
        raise ValueError("Each site config requires an id")
    return {
        "id": site_id,
        "name": str(site.get("name", site_id)).strip() or site_id,
        "base_url": str(site.get("base_url", "http://localhost:8000")).strip() or "http://localhost:8000",
        "api_key": str(site.get("api_key", "") or ""),
        "enabled": bool(site.get("enabled", True)),
    }


def _load_site_configs():
    raw = os.environ.get("GOVT_SITE_CONFIGS")
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [_normalize_site_config(site) for site in parsed]
        except Exception:
            pass
    return [dict(site) for site in DEFAULT_SITE_CONFIGS]


def _write_site_configs(sites: list[dict]):
    normalized = [_normalize_site_config(site) for site in sites]
    os.environ["GOVT_SITE_CONFIGS"] = json.dumps(normalized)
    if ENV_FILE.exists():
        content = [
            f"MOCK_PORTAL_URL={os.environ.get('MOCK_PORTAL_URL', 'http://localhost:8001')}",
            f"POSTGIS_DSN={os.environ.get('POSTGIS_DSN', 'dbname=sih26012 user=sih password=sih host=localhost port=5432')}",
            f"OFFICIAL_INDIA_BOUNDARY_QUERY={os.environ.get('OFFICIAL_INDIA_BOUNDARY_QUERY', 'https://mapservice.gov.in/mapserviceserv176/rest/services/India_Boundary/MapServer/0/query')}",
            f"FALLBACK_INDIA_BOUNDARY_URL={os.environ.get('FALLBACK_INDIA_BOUNDARY_URL', 'https://pub-0429b8e3b5a946e69ea007df844a6f1c.r2.dev/reference/india_boundary.geojson')}",
            f"PUNE_DEMO_API_KEY={os.environ.get('PUNE_DEMO_API_KEY', '')}",
            f"GOVT_SITE_CONFIGS={json.dumps(normalized)}",
        ]
        ENV_FILE.write_text("\n".join(content) + "\n", encoding="utf-8")
    return normalized


@lru_cache(maxsize=64)
def _assignment(parcel_id):
    parcel = load_parcel(parcel_id)
    if not parcel:
        raise KeyError(parcel_id)
    return retrieve_parcel(parcel_id, base_url=MOCK_PORTAL_URL, parcel_type=parcel.get("land_type"))

def db():
    if not POSTGIS_DSN:
        raise RuntimeError("PostGIS is not configured for this deployment")
    return psycopg2.connect(POSTGIS_DSN, connect_timeout=5)

@app.get("/health", tags=["System"])
def health():
    result = {"status": "ok", "service": "SIH Parcel Assignment + WebGIS API", "mode": "demo", "postgis": "not_configured"}
    if not POSTGIS_DSN:
        result["message"] = "Demo mode is active. Configure POSTGIS_DSN or DATABASE_URL to enable live PostGIS parcel queries."
        return result
    try:
        with db() as conn, conn.cursor() as cur:
            cur.execute("SELECT PostGIS_Full_Version()")
            result["postgis"] = "ok"
            result["postgis_version"] = cur.fetchone()[0]
            result["mode"] = "live"
    except Exception as exc:
        result["status"] = "degraded"
        result["postgis"] = "unavailable"
        result["postgis_error"] = str(exc)
        result["message"] = "API is online, but the configured PostGIS database is unreachable."
    return result

@app.get("/api/v1/admin/site-configs", tags=["Admin"])
def site_configs():
    return {"sites": _load_site_configs()}


@app.post("/api/v1/admin/site-configs", tags=["Admin"])
def save_site_configs(payload: dict):
    sites = payload.get("sites") if isinstance(payload, dict) else None
    if not isinstance(sites, list):
        raise HTTPException(400, "Payload must include a sites list")
    return {"sites": _write_site_configs(sites)}


@app.post("/api/v1/admin/site-configs/test", tags=["Admin"])
def test_site_config(payload: dict):
    site = _normalize_site_config(payload)
    url = site["base_url"].rstrip("/") + "/api/v1/parcels"
    headers = {"Accept": "application/json"}
    if site.get("api_key"):
        headers["X-API-Key"] = site["api_key"]
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response:
            body = response.read().decode("utf-8")
            data = json.loads(body) if body else {}
            return {
                "site": site["id"],
                "status": "ok",
                "http_status": response.status,
                "reachable": True,
                "sample": data,
            }
    except Exception as exc:
        return {
            "site": site["id"],
            "status": "error",
            "reachable": False,
            "error": str(exc),
        }


@app.get("/api/v1/parcels", tags=["Parcels"])
def parcels(): return {"parcels": list_all_parcels()}

@app.get("/api/v1/parcels/{parcel_id}", tags=["Parcels"])
def parcel(parcel_id):
    data = load_parcel(parcel_id)
    if not data: raise HTTPException(404, f"Parcel '{parcel_id}' not found")
    return {"parcel_id": data["parcel_id"], "ulpin": data["ulpin"], "description": data["description"], "land_type": data["land_type"], "area_sq_m": data["area_sq_m"], "location": data["location"]}

@app.get("/api/v1/parcels/{parcel_id}/assignment", tags=["Assignment"])
def assignment(parcel_id):
    try: result = _assignment(parcel_id)
    except KeyError: raise HTTPException(404, f"Parcel '{parcel_id}' not found")
    return result.to_dict()

@app.get("/api/v1/parcels/{parcel_id}/categories", tags=["Assignment"])
def categories(parcel_id):
    try: result = _assignment(parcel_id)
    except KeyError: raise HTTPException(404, f"Parcel '{parcel_id}' not found")
    return {"parcel_id": parcel_id, "categories": [to_standard_schema(x) for x in sorted(result.records.values(), key=lambda x: x.category_no)]}

@app.get("/api/v1/parcels/{parcel_id}/summary", tags=["Assignment"])
def summary(parcel_id):
    try: result = _assignment(parcel_id)
    except KeyError: raise HTTPException(404, f"Parcel '{parcel_id}' not found")
    return assignment_summary(result)

@app.get("/api/v1/spatial/cells/{cell_id}", tags=["Spatial"])
def spatial_cell(cell_id):
    try: cell = cell_from_id(cell_id)
    except ValueError as exc: raise HTTPException(400, str(exc))
    return {"alu": cell.id, "level": cell.level, "root_x": cell.root_ix, "root_y": cell.root_iy, "path": list(cell.path), "width_m": cell.width_m, "height_m": cell.height_m, "area_m2": cell.area_m2, "ancestor_1km": (ancestor_1km(cell).id if cell.level != "100km2" else None), "children": [child.id for child in children(cell)]}

@app.get("/api/v1/spatial/cell-info/{alu_code}", tags=["Spatial"])
def cell_info(alu_code: str):
    try: cell = cell_from_id(alu_code)
    except ValueError as exc: raise HTTPException(400, str(exc))
    x1, y1, x2, y2 = cell.mercator_bounds; row = None
    try:
        with db() as conn, conn.cursor() as cur:
            cur.execute("""WITH p AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(%s,%s),3857),4326) AS geom) SELECT parcel_id,state_code,district_code,village_code,properties,ST_X(ST_Centroid(geom)) AS lon,ST_Y(ST_Centroid(geom)) AS lat FROM cadastral_parcels,p WHERE ST_Intersects(cadastral_parcels.geom,p.geom) ORDER BY id LIMIT 1""", ((x1+x2)/2, (y1+y2)/2)); row=cur.fetchone()
    except Exception: row=None
    props=row[4] if row and isinstance(row[4],dict) else {}; common={}; aliases={"owner":("owner","owner_name","khatedar","patta_holder","holder_name"),"land_use":("land_use","landuse","use","usage"),"land_type":("land_type","landtype","property_type"),"area_m2":("area_m2","area_sq_m","area","parcel_area"),"registration_no":("registration_no","reg_no","registration"),"deed_type":("deed_type","deed"),"registration_date":("registration_date","registered_on"),"encumbrance":("encumbrance","encumbrances"),"litigation":("litigation","case_status"),"building_permission":("building_permission","building_permit","permission_no"),"occupancy":("occupancy","occupancy_certificate"),"property_tax":("property_tax","tax_status","tax_paid"),"tax_id":("tax_id","pid","property_id"),"zone":("zone","land_zone","zoning"),"infrastructure":("infrastructure",),"utilities":("utilities",),"environmental_zone":("environmental_zone","eco_zone"),"restriction_zone":("restriction_zone","restriction"),"market_value":("market_value","circle_rate")}
    for target,keys in aliases.items():
        for key in keys:
            if key in props and props[key] not in (None,""): common[target]=props[key]; break
    return {"alu":cell.id,"level":cell.level,"width_m":cell.width_m,"height_m":cell.height_m,"area_m2":cell.area_m2,"ulpin":((props.get("ulpin") or props.get("ULPIN") or props.get("ULPIN_NO") or row[0]) if row else "Not linked"),"parcel_id":(row[0] if row else None),"reference":{"source":(props.get("source") or ("PostGIS cadastral_parcels" if row else "Not linked")),"state_code":(row[1] if row else None),"district_code":(row[2] if row else None),"village_code":(row[3] if row else None),"centroid":{"lat":row[6],"lng":row[5]} if row and row[5] is not None and row[6] is not None else None,"fields":common,"properties":props}}

@app.get("/api/v1/spatial/levels", tags=["Spatial"])
def spatial_levels():
    return {"levels":[{"name":name,"side_m":spec["side_m"],"area_m2":spec["side_m"]**2,"children":spec["children"],"kind":spec["kind"],"depth":LEVEL_ORDER.index(name)} for name,spec in LEVEL_SPECS.items()],"root_code_length":6,"child_segment_length":2,"base36":"0-9A-Z","mixed_rule":"every root and hierarchy segment contains at least one letter and one number"}

@lru_cache(maxsize=1)
def _fetch_geojson(url: str):
    ctx=ssl._create_unverified_context() if url.startswith("https://") else None; request=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0","Accept":"application/json, application/geo+json, */*;q=0.8"})
    with urllib.request.urlopen(request,timeout=45,context=ctx) as response: data=json.load(response)
    features=data.get("features") or []
    if not features: raise RuntimeError(f"GeoJSON source returned no features: {url}")
    return {"type":"FeatureCollection","features":features}

@lru_cache(maxsize=1)
def _official_india_boundary():
    params=urllib.parse.urlencode({"where":"1=1","outFields":"*","returnGeometry":"true","outSR":"4326","f":"geojson"}); url=OFFICIAL_INDIA_BOUNDARY_QUERY+"?"+params
    try: return _fetch_geojson(url)
    except Exception: return _fetch_geojson(FALLBACK_INDIA_BOUNDARY_URL)

@app.get("/api/v1/spatial/india-boundaries", tags=["Spatial"])
def india_boundaries():
    try: return _official_india_boundary()
    except Exception as official_exc:
        try:
            with db() as conn, conn.cursor() as cur:
                cur.execute("""SELECT ST_AsGeoJSON(ST_Multi(ST_CollectionExtract(ST_UnaryUnion(ST_Collect(geom)),3)))::json AS geometry FROM admin_boundaries WHERE level='state'"""); row=cur.fetchone()
            if not row or not row[0]: raise RuntimeError("No fallback boundary in PostGIS")
            return {"type":"FeatureCollection","features":[{"type":"Feature","id":"india-national-boundary-fallback","properties":{"name":"India","source":"PostGIS state boundary fallback"},"geometry":row[0]}]}
        except Exception as db_exc: raise HTTPException(503,f"Official India boundary unavailable: {official_exc}; PostGIS fallback unavailable: {db_exc}")

@app.post("/api/v1/rounds/demo", tags=["Rounds"])
def process_demo_rounds():
    pids=[p["parcel_id"] for p in list_all_parcels()]; processor=RoundProcessor(base_url=MOCK_PORTAL_URL); roots=[Cell("100km2",0,idx,()) for idx in range(len(pids))]; targets={"100km2":[RoundCell(cell,pids[idx]) for idx,cell in enumerate(roots)]}; return {"rounds":[result.to_dict() for result in processor.process_all_levels(targets)]}

frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
