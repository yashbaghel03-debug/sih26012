"""Phase 9 — FastAPI API for assignment and real spatial data."""
from __future__ import annotations
import os
import re
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
app=FastAPI(title="SIH 2026 Parcel Assignment + WebGIS API",version="3.4.0",description="Assignment engine plus PostGIS-backed India WebGIS.")
app.add_middleware(CORSMiddleware,allow_origins=["http://localhost:3000","http://localhost:5173"],allow_credentials=True,allow_methods=["GET","POST"],allow_headers=["*"])

@lru_cache(maxsize=32)
def _assignment(parcel_id):
    parcel=load_parcel(parcel_id)
    if not parcel: raise KeyError(parcel_id)
    return retrieve_parcel(parcel_id,base_url=MOCK_PORTAL_URL,parcel_type=parcel.get("land_type"))

def db(): return psycopg2.connect(POSTGIS_DSN)

@app.get("/health",tags=["System"])
def health():
    result={"status":"ok","service":"SIH 2026 Parcel Assignment + WebGIS API","postgis":"unknown"}
    try:
        with db() as conn, conn.cursor() as cur:
            cur.execute("SELECT PostGIS_Full_Version()")
            result["postgis"]="ok";result["postgis_version"]=cur.fetchone()[0]
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
    except (ValueError,IndexError):raise HTTPException(400,"Invalid cell ID")
    return {"cell_id":c.id,"level":c.level,"ix":c.ix,"iy":c.iy,"width_m":c.width_m,"height_m":c.height_m,"area_m2":c.area_m2,"ancestor_1km":ancestor_1km(c).id,"children":[x.id for x in children(c)]}

@app.get("/api/v1/spatial/levels",tags=["Spatial"])
def spatial_levels(): return {"levels":["500km","250km","100km","50km","10km","1km","100m","10m","1m","0.1m2"]}

@app.get("/api/v1/spatial/india-boundaries",tags=["Spatial"])
def india_boundaries():
    try:
        with db() as conn, conn.cursor() as cur:
            cur.execute("""SELECT id,name,code,ST_AsGeoJSON(geom)::json AS geometry,properties FROM admin_boundaries WHERE level='state' ORDER BY name""")
            rows=cur.fetchall()
    except Exception as exc: raise HTTPException(503,f"PostGIS unavailable: {exc}")
    return {"type":"FeatureCollection","features":[{"type":"Feature","id":r[0],"properties":{"name":r[1],"code":r[2],**(r[4] or {})},"geometry":r[3]} for r in rows]}

GRID_LEVELS=[(4,"500km",500000.0,500000.0),(6,"250km",250000.0,250000.0),(8,"100km",100000.0,100000.0),(9,"50km",50000.0,50000.0),(10,"10km",10000.0,10000.0),(12,"1km",1000.0,1000.0),(15,"100m",100.0,100.0),(18,"10m",10.0,10.0),(22,"1m",1.0,1.0),(27,"0.1m2",0.1,1.0)]
def _grid_for_zoom(zoom:int):
    chosen=GRID_LEVELS[0]
    for item in GRID_LEVELS:
        if zoom>=item[0]: chosen=item
    return chosen
def _safe_part(v:int)->str: return f"m{abs(v)}" if v<0 else f"p{v}"

def _grid_size_from_id(cell_id:str):
    m=re.fullmatch(r"ALU-(500km|250km|100km|50km|10km|1km|100m|10m|1m|0\.1m2)-x([mp]\d+)-y([mp]\d+)",cell_id.strip(),re.I)
    if not m: raise ValueError("Invalid ALU cell ID")
    level=next((x for x in GRID_LEVELS if x[1].lower()==m.group(1).lower()),None)
    if not level: raise ValueError("Unknown ALU level")
    sx=sy=level[2]
    if level[1]=="0.1m2": sx,sy=0.1,1.0
    def dec(s): return (-1 if s[0].lower()=="m" else 1)*int(s[1:])
    return level[1],sx,sy,dec(m.group(2)),dec(m.group(3))

@app.get("/api/v1/spatial/cell-info/{cell_id}",tags=["Spatial"])
def spatial_cell_info(cell_id:str):
    try:level,sx,sy,ix,iy=_grid_size_from_id(cell_id)
    except ValueError as exc: raise HTTPException(400,str(exc))
    # Query only the cadastral layer. If no authoritative cadastral record is
    # loaded yet, return an explicit unlinked state instead of inventing ULPINs.
    # For lookup we use the ALU cell centre in EPSG:3857 converted to 4326.
    try:
        with db() as conn, conn.cursor() as cur:
            cx=(ix+0.5)*sx;cy=(iy+0.5)*sy
            cur.execute("""WITH p AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(%s,%s),3857),4326) geom)
                         SELECT parcel_id, properties->>'ulpin' AS ulpin
                         FROM cadastral_parcels,p WHERE ST_Intersects(cadastral_parcels.geom,p.geom)
                         ORDER BY id LIMIT 1""",(cx,cy))
            row=cur.fetchone()
    except Exception as exc:
        return {"cell_id":cell_id,"level":level,"width_m":sx,"height_m":sy,"area_m2":sx*sy,"ulpin":None,"status":"cadastral layer unavailable"}
    return {"cell_id":cell_id,"level":level,"width_m":sx,"height_m":sy,"area_m2":sx*sy,"ulpin":(row[1] or row[0]) if row else None,"parcel_id":row[0] if row else None,"status":"linked" if row else "not linked"}

@app.get("/api/v1/spatial/grid",tags=["Spatial"])
def spatial_grid(west:float=Query(...),south:float=Query(...),east:float=Query(...),north:float=Query(...),zoom:int=Query(...,ge=4,le=31)):
    if west>=east or south>=north: raise HTTPException(400,"Invalid bounding box")
    _,name,sx,sy=_grid_for_zoom(zoom)
    sql="""WITH b AS (SELECT ST_Transform(ST_MakeEnvelope(%s,%s,%s,%s,4326),3857) g),p AS (SELECT ST_XMin(g) xmin,ST_XMax(g) xmax,ST_YMin(g) ymin,ST_YMax(g) ymax FROM b),idx AS (SELECT ix,iy FROM p,generate_series(floor(xmin/%s)::bigint,ceil(xmax/%s)::bigint-1) ix,generate_series(floor(ymin/%s)::bigint,ceil(ymax/%s)::bigint-1) iy LIMIT 1501),cells AS (SELECT ix,iy,ST_Transform(ST_MakeEnvelope(ix*%s,iy*%s,(ix+1)*%s,(iy+1)*%s,3857),4326) geom FROM idx) SELECT ix,iy,ST_AsGeoJSON(geom)::json geometry FROM cells LIMIT 1500"""
    try:
        with db() as conn, conn.cursor() as cur:
            cur.execute(sql,(west,south,east,north,sx,sx,sy,sy,sx,sy,sx,sy));rows=cur.fetchall()
    except Exception as exc: raise HTTPException(503,f"PostGIS unavailable: {exc}")
    return {"level":name,"width_m":sx,"height_m":sy,"area_m2":sx*sy,"zoom":zoom,"count":len(rows),"truncated":len(rows)>=1500,"features":[{"type":"Feature","properties":{"ix":r[0],"iy":r[1],"level":name,"width_m":sx,"height_m":sy,"area_m2":sx*sy},"geometry":r[2]} for r in rows]}

@app.get("/api/v1/spatial/search-numbering",tags=["Spatial"])
def search_numbering(west:float=Query(...),south:float=Query(...),east:float=Query(...),north:float=Query(...),limit:int=Query(100,ge=1,le=1000)):
    if west>=east or south>=north: raise HTTPException(400,"Invalid bounding box")
    count_sql="""WITH b AS (SELECT ST_Transform(ST_MakeEnvelope(%s,%s,%s,%s,4326),3857) g),p AS (SELECT ceil(ST_XMax(g)/0.1)::bigint-floor(ST_XMin(g)/0.1)::bigint nx,ceil(ST_YMax(g)/1.0)::bigint-floor(ST_YMin(g)/1.0)::bigint ny FROM b) SELECT nx*ny FROM p"""
    items_sql="""WITH b AS (SELECT ST_Transform(ST_MakeEnvelope(%s,%s,%s,%s,4326),3857) g),p AS (SELECT floor(ST_XMin(g)/0.1)::bigint xmin,ceil(ST_XMax(g)/0.1)::bigint xmax,floor(ST_YMin(g)/1.0)::bigint ymin,ceil(ST_YMax(g)/1.0)::bigint ymax FROM b),d AS (SELECT xmax-xmin nx,xmin,ymax FROM p),seq AS (SELECT generate_series(0,%s-1) n,* FROM d) SELECT n+1,(xmin+(n%%nx))::bigint,(ymax-1-floor(n/nx))::bigint FROM seq WHERE n < nx*(ymax-ymin) ORDER BY n"""
    try:
        with db() as conn, conn.cursor() as cur:
            cur.execute(count_sql,(west,south,east,north));total=int(cur.fetchone()[0]);actual_limit=min(limit,total)
            cur.execute(items_sql,(west,south,east,north,actual_limit));rows=cur.fetchall()
    except Exception as exc: raise HTTPException(503,f"PostGIS unavailable: {exc}")
    return {"level":"0.1m2","width_m":0.1,"height_m":1.0,"area_m2":0.1,"total_cells":total,"numbering":"row-major north-west to south-east; partial edge cells are included first","items":[{"search_number":int(r[0]),"ix":int(r[1]),"iy":int(r[2]),"alu_id":f"ALU-0.1m2-x{_safe_part(int(r[1]))}-y{_safe_part(int(r[2]))}"} for r in rows]}

@app.post("/api/v1/rounds/demo",tags=["Rounds"])
def process_demo_rounds():
    pids=[p["parcel_id"] for p in list_all_parcels()]
    processor=RoundProcessor(base_url=MOCK_PORTAL_URL)
    targets={level:[RoundCell(Cell(level,i,idx),pid) for i,pid in enumerate(pids)] for idx,level in enumerate(ROUND_LEVELS)}
    return {"rounds":[r.to_dict() for r in processor.process_all_levels(targets)]}
