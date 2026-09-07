"""Phase 9 — FastAPI API for assignment and real spatial data."""
from __future__ import annotations
import os
from functools import lru_cache
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from ..mock_gov_portal.fixtures.loader import list_all_parcels, load_parcel
from ..retrieval_engine.engine import assignment_summary
from ..retrieval_engine.engine_v2 import retrieve_parcel
from ..retrieval_engine.normalizer import to_standard_schema
from ..retrieval_engine.rounds import RoundCell, RoundProcessor, ROUND_LEVELS
from ..spatial_indexing.lattice import Cell, cell_from_id, children, ancestor_1km

MOCK_PORTAL_URL=os.environ.get("MOCK_PORTAL_URL","http://localhost:8001")
POSTGIS_DSN=os.environ.get("POSTGIS_DSN","dbname=sih26012 user=sih password=sih host=localhost port=5432")
app=FastAPI(title="SIH 2026 Parcel Assignment + WebGIS API",version="3.1.0",description="Assignment engine plus PostGIS-backed India WebGIS.")
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
        with db() as conn, conn.cursor() as cur:
            cur.execute("SELECT PostGIS_Full_Version()")
            result["postgis"]="ok"
            result["postgis_version"]=cur.fetchone()[0]
    except Exception as exc:
        result["postgis"]="unavailable"
        result["postgis_error"]=str(exc)
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
    except (ValueError,IndexError):raise HTTPException(400,"Invalid cell ID")
    return {"cell_id":c.id,"level":c.level,"ix":c.ix,"iy":c.iy,"width_m":c.width_m,"height_m":c.height_m,"area_m2":c.area_m2,"ancestor_1km":ancestor_1km(c).id,"children":[x.id for x in children(c)]}

@app.get("/api/v1/spatial/levels",tags=["Spatial"])
def spatial_levels(): return {"levels":list(ROUND_LEVELS)}

@app.get("/api/v1/spatial/india-boundaries",tags=["Spatial"])
def india_boundaries():
    try:
        with db() as conn, conn.cursor() as cur:
            cur.execute("""SELECT id,name,code,ST_AsGeoJSON(geom)::json AS geometry,properties FROM admin_boundaries WHERE level='state' ORDER BY name""")
            rows=cur.fetchall()
    except Exception as exc:
        raise HTTPException(503,f"PostGIS unavailable: {exc}")
    return {"type":"FeatureCollection","features":[{"type":"Feature","id":r[0],"properties":{"name":r[1],"code":r[2],**(r[4] or {})},"geometry":r[3]} for r in rows]}

# Visual hierarchy: country-scale display cells lead into the canonical ALU levels.
GRID_LEVELS=[
    (4,"500 km",500000.0,500000.0),
    (6,"250 km",250000.0,250000.0),
    (8,"100 km",100000.0,100000.0),
    (9,"50 km",50000.0,50000.0),
    (10,"10 km",10000.0,10000.0),
    (12,"1 km",1000.0,1000.0),
    (15,"100 m",100.0,100.0),
    (18,"10 m",10.0,10.0),
    (22,"1 m",1.0,1.0),
    (27,"0.1 m²",0.1,1.0),
]

@app.get("/api/v1/spatial/grid",tags=["Spatial"])
def spatial_grid(west:float=Query(...),south:float=Query(...),east:float=Query(...),north:float=Query(...),zoom:int=Query(...,ge=4,le=31)):
    if west>=east or south>=north: raise HTTPException(400,"Invalid bounding box")
    level,name,sx,sy=GRID_LEVELS[0]
    for item in GRID_LEVELS:
        if zoom>=item[0]: level,name,sx,sy=item
    sql="""
    WITH b AS (SELECT ST_Transform(ST_MakeEnvelope(%s,%s,%s,%s,4326),3857) g),
    p AS (SELECT ST_XMin(g) xmin,ST_XMax(g) xmax,ST_YMin(g) ymin,ST_YMax(g) ymax FROM b),
    idx AS (
      SELECT ix,iy FROM p,
      generate_series(floor(xmin/%s)::bigint,ceil(xmax/%s)::bigint-1) ix,
      generate_series(floor(ymin/%s)::bigint,ceil(ymax/%s)::bigint-1) iy
      LIMIT 1501
    ), cells AS (
      SELECT ix,iy,ST_Transform(ST_MakeEnvelope(ix*%s,iy*%s,(ix+1)*%s,(iy+1)*%s,3857),4326) geom FROM idx
    ) SELECT ix,iy,ST_AsGeoJSON(geom)::json geometry FROM cells LIMIT 1500
    """
    try:
        with db() as conn, conn.cursor() as cur:
            cur.execute(sql,(west,south,east,north,sx,sx,sy,sy,sx,sy,sx,sy))
            rows=cur.fetchall()
    except Exception as exc:
        raise HTTPException(503,f"PostGIS unavailable: {exc}")
    return {"level":name,"width_m":sx,"height_m":sy,"area_m2":sx*sy,"zoom":zoom,"count":len(rows),"truncated":len(rows)>=1500,"features":[{"type":"Feature","properties":{"ix":r[0],"iy":r[1],"level":name,"width_m":sx,"height_m":sy,"area_m2":sx*sy},"geometry":r[2]} for r in rows]}

@app.post("/api/v1/rounds/demo",tags=["Rounds"])
def process_demo_rounds():
    pids=[p["parcel_id"] for p in list_all_parcels()]
    processor=RoundProcessor(base_url=MOCK_PORTAL_URL)
    targets={level:[RoundCell(Cell(level,i,idx),pid) for i,pid in enumerate(pids)] for idx,level in enumerate(ROUND_LEVELS)}
    return {"rounds":[r.to_dict() for r in processor.process_all_levels(targets)]}
