from __future__ import annotations
from typing import Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from .store import SOURCES, attach_geometry, get_all_information, get_alu_link, get_parcel, get_records, list_parcels, seed_demo, get_conn
from .alu_catalog import catalog_stats, list_cells, seed_catalog
from .coverage import classify_alu, coverage_cells, compact_coverage_grid, STATUS_LABELS

router=APIRouter(prefix='/api/v1/pune-demo',tags=['Pune Demo Portals'])

class GeometryUpdate(BaseModel):
    geometry: dict[str,Any]=Field(...,description='Authorized EPSG:4326 GeoJSON Polygon/MultiPolygon')
    geometry_source: str=Field(...,min_length=3)

def category(service): return {'land_records':'land_records','registration':'registration_deeds','planning_building':'planning_building','property_tax':'property_tax','utilities_infrastructure':'utility_infrastructure','legal_encumbrance':'legal_encumbrance'}.get(service,service)

def records_response(pid,cat):
    if not get_parcel(pid): raise HTTPException(404,'Parcel not found')
    rows=get_records(pid,cat)
    return {'parcel_id':pid,'status':rows[0]['data_status'] if rows else 'N/D','records':[{'record_id':r['record_identifier'],'status':r['data_status'],'source':{'source_id':r['source_id'],'source_name':r['source_name'],'source_url':r['source_url']},'is_fictional':r['is_fictional'],'data':r['payload']} for r in rows], 'message': None if rows else 'Information is presently unavailable through this demo service.'}

@router.get('/health')
def health():
    try:
        with get_conn() as conn:
            return {'status':'ok','database':'PostgreSQL/PostGIS','pilot':'Kothrud / Kothrud-South, Pune','demo':True,'seed':seed_demo(conn,False),'alu':seed_catalog(conn,False)}
    except Exception as exc: return {'status':'degraded','database':'unavailable','pilot':'Kothrud / Kothrud-South, Pune','demo':True,'error':str(exc)}

@router.post('/seed')
def seed(reset: bool=False):
    try:
        with get_conn() as conn:
            parcel_result=seed_demo(conn,reset)
            alu_result=seed_catalog(conn,reset)
            return {'parcels':parcel_result,'alu':alu_result}
    except Exception as exc: raise HTTPException(503,f'PostGIS unavailable: {exc}')

@router.get('/search')
def search(q:str='',service:str|None=None,limit:int=Query(25,ge=1,le=100)):
    rows=list_parcels(q,limit)
    if service and service!='citizen_land_services':
        cat=category(service); rows=[r for r in rows if get_records(r['parcel_id'],cat)]
    return {'query':q,'service':service,'results':rows,'disclaimer':'DEMO / FICTIONAL RECORD DATA'}

@router.get('/parcels')
def parcels(q:str='',limit:int=Query(50,ge=1,le=200)):
    return {'pilot':'Kothrud / Kothrud-South, Pune','parcels':list_parcels(q,limit),'disclaimer':'DEMO / FICTIONAL RECORD DATA'}

@router.get('/parcels/{parcel_id}')
def parcel(parcel_id:str):
    data=get_all_information(parcel_id)
    if not data: raise HTTPException(404,'Parcel not found')
    return data

@router.get('/parcels/{parcel_id}/geometry')
def geometry(parcel_id:str):
    p=get_parcel(parcel_id)
    if not p: raise HTTPException(404,'Parcel not found')
    return {'parcel_id':parcel_id,'geometry':p['geometry'],'geometry_status':p['geometry_status'],'source':'N/D until authorized cadastral geometry is imported' if not p['geometry'] else 'canonical_parcels'}

@router.put('/parcels/{parcel_id}/geometry')
def update_geometry(parcel_id:str,body:GeometryUpdate):
    try:return attach_geometry(parcel_id,body.geometry,body.geometry_source)
    except KeyError: raise HTTPException(404,'Parcel not found')
    except ValueError as exc: raise HTTPException(400,str(exc))
    except Exception as exc: raise HTTPException(503,f'Geometry update failed: {exc}')

@router.get('/parcels/{parcel_id}/alu')
def alu_for_parcel(parcel_id:str):
    if not get_parcel(parcel_id): raise HTTPException(404,'Parcel not found')
    link=get_alu_link(parcel_id)
    return {'parcel_id':parcel_id,'alu':link['alu_id'],'level':'1m2','status':'AVAILABLE'} if link else {'parcel_id':parcel_id,'alu':None,'status':'N/D','message':'ALU linkage is withheld until authorized cadastral geometry is available.'}

@router.get('/alu-catalog')
def alu_catalog():
    try:
        with get_conn() as conn:
            meta=catalog_stats(conn)
            meta['coverage_status_labels']=STATUS_LABELS
            meta['coverage_rule']='GREEN=19-21 non-N/D/non-N/A fields; YELLOW=15-18; RED=0-14; WHITE=not searched due to controversial boundary'
            meta['white_cells']=0
            return meta
    except Exception as exc: raise HTTPException(503,f'ALU catalog unavailable: {exc}')

@router.get('/alu-catalog/cells')
def alu_catalog_cells(level:str='1m2',limit:int=Query(10000,ge=1,le=100000),offset:int=Query(0,ge=0)):
    try:
        with get_conn() as conn:return list_cells(conn,level,limit,offset)
    except ValueError as exc: raise HTTPException(400,str(exc))
    except Exception as exc: raise HTTPException(503,f'ALU catalog unavailable: {exc}')

@router.get('/alu-catalog/coverage-cells')
def alu_coverage_cells(level:str='1m2',limit:int=Query(10000,ge=1,le=10000),offset:int=Query(0,ge=0)):
    try:
        with get_conn() as conn:return coverage_cells(conn,level,limit,offset)
    except ValueError as exc: raise HTTPException(400,str(exc))
    except Exception as exc: raise HTTPException(503,f'ALU coverage catalog unavailable: {exc}')

@router.get('/alu-catalog/coverage-grid')
def alu_coverage_grid(level:str='1m2'):
    try:
        return compact_coverage_grid(level)
    except ValueError as exc: raise HTTPException(400,str(exc))
    except Exception as exc: raise HTTPException(503,f'ALU coverage grid unavailable: {exc}')

@router.get('/alu-catalog/cells/{alu_id}/details')
def alu_catalog_cell_details(alu_id: str):
    try:
        return classify_alu(alu_id)
    except ValueError as exc:
        raise HTTPException(400,str(exc))

@router.get('/parcels/{parcel_id}/land-records')
def land_records(parcel_id:str): return records_response(parcel_id,'land_records')
@router.get('/parcels/{parcel_id}/registration')
def registration(parcel_id:str): return records_response(parcel_id,'registration_deeds')
@router.get('/parcels/{parcel_id}/planning')
def planning(parcel_id:str): return records_response(parcel_id,'planning_building')
@router.get('/parcels/{parcel_id}/building')
def building(parcel_id:str): return records_response(parcel_id,'planning_building')
@router.get('/parcels/{parcel_id}/tax')
def tax(parcel_id:str): return records_response(parcel_id,'property_tax')
@router.get('/parcels/{parcel_id}/utilities')
def utilities(parcel_id:str): return records_response(parcel_id,'utility_infrastructure')
@router.get('/parcels/{parcel_id}/legal')
def legal(parcel_id:str): return records_response(parcel_id,'legal_encumbrance')

@router.get('/parcels/{parcel_id}/all-information')
def all_information(parcel_id:str):
    data=get_all_information(parcel_id)
    if not data: raise HTTPException(404,'Parcel not found')
    return data

@router.get('/workflow/{parcel_id}')
def workflow(parcel_id:str):
    data=get_all_information(parcel_id)
    if not data: raise HTTPException(404,'Parcel not found')
    return {'parcel_id':parcel_id,'workflow':[{'category':k,'status':v['status'],'record_id':v['record_id'],'source_id':v['source']['source_id']} for k,v in data['categories'].items()],'deterministic':True}

@router.get('/alu/{alu_id}')
def alu_lookup(alu_id:str):
    try:
        from ..spatial_indexing.lattice import cell_from_id
        c=cell_from_id(alu_id)
    except ValueError as exc: raise HTTPException(400,str(exc))
    return {'alu':c.id,'level':c.level,'area_m2':c.area_m2,'path':list(c.path),'is_government_identifier':False,'note':'ALU is the project deterministic spatial index.'}

@router.get('/ulpin/{ulpin}')
def ulpin_lookup(ulpin:str):
    rows=[p for p in list_parcels(ulpin,50) if p.get('ulpin')]
    if not rows: raise HTTPException(404,'ULPIN is N/D for this demo dataset; no government ULPIN has been imported.')
    return {'results':rows}

@router.get('/sources')
def sources(): return {'sources':list(SOURCES.values()),'disclaimer':'Workflow references are based on public government sources; records are fictional.'}

@router.get('/sources/{source_id}')
def source(source_id:str):
    s=SOURCES.get(source_id)
    if not s: raise HTTPException(404,'Source not found')
    return s
