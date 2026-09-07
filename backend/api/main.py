"""Phase 9 — stable frontend-facing FastAPI API for the WebGIS."""
from __future__ import annotations
import os
from functools import lru_cache
from fastapi import FastAPI,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ..mock_gov_portal.fixtures.loader import list_all_parcels,load_parcel
from ..retrieval_engine.engine import assignment_summary
from ..retrieval_engine.engine_v2 import retrieve_parcel
from ..retrieval_engine.normalizer import to_standard_schema
from ..retrieval_engine.rounds import RoundCell,RoundProcessor,ROUND_LEVELS
from ..spatial_indexing.lattice import Cell,cell_from_id,children,ancestor_1km
MOCK_PORTAL_URL=os.environ.get("MOCK_PORTAL_URL","http://localhost:8001")
app=FastAPI(title="SIH 2026 Parcel Assignment API",version="2.0.0",description="Deterministic WebGIS-facing API for Problem Statement 26012.")
app.add_middleware(CORSMiddleware,allow_origins=["http://localhost:3000","http://localhost:5173"],allow_credentials=True,allow_methods=["GET","POST"],allow_headers=["*"])
@lru_cache(maxsize=32)
def _assignment(parcel_id):
    parcel=load_parcel(parcel_id)
    if not parcel:raise KeyError(parcel_id)
    return retrieve_parcel(parcel_id,base_url=MOCK_PORTAL_URL,parcel_type=parcel.get("land_type"))
@app.get("/health",tags=["System"])
def health():return {"status":"ok","service":"SIH Parcel Assignment API"}
@app.get("/api/v1/parcels",tags=["Parcels"])
def parcels():return {"parcels":list_all_parcels()}
@app.get("/api/v1/parcels/{parcel_id}",tags=["Parcels"])
def parcel(parcel_id):
    data=load_parcel(parcel_id)
    if not data:raise HTTPException(404,f"Parcel '{parcel_id}' not found")
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
def spatial_levels():return {"levels":list(ROUND_LEVELS)}
@app.post("/api/v1/rounds/demo",tags=["Rounds"])
def process_demo_rounds():
    pids=[p["parcel_id"] for p in list_all_parcels()]
    processor=RoundProcessor(base_url=MOCK_PORTAL_URL)
    targets={level:[RoundCell(Cell(level,i,idx),pid) for i,pid in enumerate(pids)] for idx,level in enumerate(ROUND_LEVELS)}
    return {"rounds":[r.to_dict() for r in processor.process_all_levels(targets)]}
