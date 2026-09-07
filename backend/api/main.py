"""FastAPI API for assignment and PostGIS-backed WebGIS."""
from __future__ import annotations
import os
from functools import lru_cache
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from ..mock_gov_portal.fixtures.loader import list_all_parcels, load_parcel
from ..retrieval_engine.engine import assignment_summary
from ..retrieval_engine.engine_v2 import retrieve_parcel
from ..retrieval_engine.normalizer import to_standard_schema
from ..retrieval_engine.rounds import RoundCell, RoundProcessor
from ..spatial_indexing.lattice import Cell, LEVEL_ORDER, cell_from_id, children, ancestor_1km

MOCK_PORTAL_URL=os.environ.get("MOCK_PORTAL_URL","http://localhost:8001")
POSTGIS_DSN=os.environ.get("POSTGIS_DSN","dbname=sih26012 user=sih password=sih host=localhost port=5432")
app=FastAPI(title="SIH 2026 Parcel Assignment + WebGIS API",version="4.0.0",description="Hierarchical ALU indexing with PostGIS-backed India WebGIS.")
app.add_middleware(CORSMiddleware,allow_origins=["http://localhost:3000","http://localhost:5173"],allow_credentials=True,allow_methods=["GET","POST"],allow_headers=["*"])

@lru_cache(maxsize=32)
def _assignment(parcel_id):
    parcel=load_parcel(parcel_id)
    if not parcel: raise KeyError(parcel_id)
    return retrieve_parcel(parcel_id,base_url=MOCK_PORTAL_URL,parcel_type=parcel.get("land_type"))

def db(): return psycopg2.connect(POSTGIS_DSN)

@app.get("/health",tags=["System"])
def health():
    result={"status":"ok","service":"SIH Parcel Assignment + WebGIS API","postgis":"unknown"}
    try:
        with db() as conn,conn.cursor() as cur:
            cur.execute("SELECT PostGIS_Full_Version()");result["postgis"]="ok";result["postgis_version"]=cur.fetchone()[0]
    except Exception as exc:
        result["postgis"]="unavailable";result["postgis_error"]=str(exc)
    return result

@app.get("/api/v1/parcels",tags=["Parcels"])
def parcels(): return {"parcels":list_all_parcels()}

@app.get("/api/v1/parcels/{parcel_id}",tags=["Parcels"])
def parcel(parcel_id):
    data=load_parcel(parcel_id)
    if not data: raise HTTPException(404,f"Parcel '{parcel_id}' not found")
    return {"parcel_id":data["parcel_id"],"ulpin":data["ulpin"],"description":data["description"],"land_type":data["land_type"],"area_sq_m":data["area_sq_m"],"location":data["location"]}

@app.get("/api/v1/parcels/{parcel_id}/assignment",tags=["Assignment"])
def assignment(parcel_id):
    try:r=_assignment(parcel_id)
    except KeyError:raise HTTPException(404,f"Parcel '{parcel_id}' not found")
    return r.to_dict()

@app.get("/api/v1/parcels/{parcel_id}/categories",tags=["Assignment"])
def categories(parcel_id):
    try:r=_assignment(parcel_id)
    except KeyError:raise HTTPException(404,f"Parcel '{parcel_id}' not found")
    return {"parcel_id":parcel_id,"categories":[to_standard_schema(x) for x in sorted(r.records.values(),key=lambda x:x.category_no)]}

@app.get("/api/v1/parcels/{parcel_id}/summary",tags=["Assignment"])
def summary(parcel_id):
    try:r=_assignment(parcel_id)
    except KeyError:raise HTTPException(404,f"Parcel '{parcel_id}' not found")
    return assignment_summary(r)

@app.get("/api/v1/spatial/cells/{cell_id}",tags=["Spatial"])
def spatial_cell(cell_id):
    try:c=cell_from_id(cell_id)
    except (ValueError,IndexError) as exc: raise HTTPException(400,str(exc))
    return {"alu":c.id,"level":c.level,"root_x":c.root_ix,"root_y":c.root_iy,"path":list(c.path),"width_m":c.width_m,"height_m":c.height_m,"area_m2":c.area_m2,"ancestor_1km":ancestor_1km(c).id,"children":[x.id for x in children(c)]}

@app.get("/api/v1/spatial/cell-info/{alu_code}",tags=["Spatial"])
def cell_info(alu_code:str):
    try:c=cell_from_id(alu_code)
    except ValueError as exc: raise HTTPException(400,str(exc))
    x1,y1,x2,y2=c.mercator_bounds
    try:
        with db() as conn,conn.cursor() as cur:
            cur.execute("""WITH p AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(%s,%s),3857),4326) geom)
                         SELECT parcel_id,COALESCE(properties->>'ulpin',properties->>'ULPIN',properties->>'ULPIN_NO') AS ulpin
                         FROM cadastral_parcels,p WHERE ST_Intersects(cadastral_parcels.geom,p.geom) ORDER BY id LIMIT 1""",((x1+x2)/2,(y1+y2)/2))
            row=cur.fetchone()
    except Exception:
        row=None
    return {"alu":c.id,"level":c.level,"width_m":c.width_m,"height_m":c.height_m,"area_m2":c.area_m2,"ulpin":(row[1] or row[0]) if row else "Not linked","parcel_id":row[0] if row else None}

@app.get("/api/v1/spatial/levels",tags=["Spatial"])
def spatial_levels():
    return {"levels":list(LEVEL_ORDER),"root_code_length":6,"child_segment_length":2,"base36":"0-9A-Z","mixed_rule":"every root and hierarchy segment contains at least one letter and one number"}

@app.get("/api/v1/spatial/india-boundaries",tags=["Spatial"])
def india_boundaries():
    try:
        with db() as conn,conn.cursor() as cur:
            cur.execute("SELECT id,name,code,ST_AsGeoJSON(geom)::json AS geometry,properties FROM admin_boundaries WHERE level='state' ORDER BY name")
            rows=cur.fetchall()
    except Exception as exc: raise HTTPException(503,f"PostGIS unavailable: {exc}")
    return {"type":"FeatureCollection","features":[{"type":"Feature","id":r[0],"properties":{"name":r[1],"code":r[2],**(r[4] or {})},"geometry":r[3]} for r in rows]}

@app.post("/api/v1/rounds/demo",tags=["Rounds"])
def process_demo_rounds():
    pids=[p["parcel_id"] for p in list_all_parcels()]
    processor=RoundProcessor(base_url=MOCK_PORTAL_URL)
    root_cells=[Cell("1km2",i,idx,()) for idx,i in enumerate(range(len(pids)))]
    targets={"1km2":[RoundCell(c,pids[idx]) for idx,c in enumerate(root_cells)]}
    return {"rounds":[r.to_dict() for r in processor.process_all_levels(targets)]}
