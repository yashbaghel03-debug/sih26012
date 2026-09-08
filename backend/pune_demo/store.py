from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from math import floor
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor
from pyproj import Transformer
from shapely.geometry import MultiPolygon, box, shape
from shapely.ops import transform

from ..spatial_indexing.lattice import Cell, ROOT_COLS, ROOT_ORIGIN_X, ROOT_ORIGIN_Y, cell_from_id

POSTGIS_DSN=os.environ.get('POSTGIS_DSN','dbname=sih26012 user=sih password=sih host=localhost port=5432')
SOURCES={
'MH_LAND_RECORDS':{'source_id':'MH_LAND_RECORDS','source_name':'Maharashtra Land Records Demo','department':'Revenue Department, Government of Maharashtra','service':'7/12, 8A, Property Card and Ferfar reference','url':'https://mahabhumi.gov.in/'},
'MH_JURISDICTION':{'source_id':'MH_JURISDICTION','source_name':'Maharashtra Land Jurisdiction Demo','department':'Mahavillages / Land Records','service':'ULPIN, CTS, Survey/Gat and jurisdiction reference','url':'https://mahavillages.mahabhumi.gov.in/newjurisdiction.php'},
'BHUNAKSHA_MH':{'source_id':'BHUNAKSHA_MH','source_name':'Maharashtra Bhu-Naksha Reference','department':'NIC / Maharashtra cadastral mapping','service':'Cadastral map and plot search reference','url':'https://bhunaksha.nic.in/bhunaksha/'},
'MH_REGISTRATION':{'source_id':'MH_REGISTRATION','source_name':'Pune Property Registration Demo','department':'Registration & Stamps, Government of Maharashtra','service':'Document and registration reference','url':'https://igrmaharashtra.gov.in/'},
'PMC_BUILDING':{'source_id':'PMC_BUILDING','source_name':'Pune Planning & Building Demo','department':'Pune Municipal Corporation','service':'AutoDCR / building proposal and GIS reference','url':'https://autodcr.pmc.gov.in/swc.client/'},
'PMC_PROPERTY_TAX':{'source_id':'PMC_PROPERTY_TAX','source_name':'Pune Property Tax Demo','department':'Pune Municipal Corporation','service':'Property tax and assessment reference','url':'https://pmc.gov.in/'},
'UTILITY_INFRA':{'source_id':'UTILITY_INFRA','source_name':'Pune Utilities & Infrastructure Demo','department':'Municipal utility / infrastructure agencies','service':'Utility and infrastructure reference','url':'https://pmc.gov.in/'},
'LEGAL_ENCUMBRANCE':{'source_id':'LEGAL_ENCUMBRANCE','source_name':'Maharashtra Legal Property Records Demo','department':'Registration / courts / charge reference','service':'Encumbrance, mortgage and litigation reference','url':'https://mahabhumi.gov.in/'}}
SERVICES={'land_records':'MH_LAND_RECORDS','registration':'MH_REGISTRATION','planning_building':'PMC_BUILDING','property_tax':'PMC_PROPERTY_TAX','utilities_infrastructure':'UTILITY_INFRA','legal_encumbrance':'LEGAL_ENCUMBRANCE'}
HOLDERS=['Aarav Kulkarni','Ishita Deshmukh','Rohan Patil','Mira Joshi','Kabir Pawar','Anaya Shinde','Vedant More','Nandini Bhosale']
LAND_TYPES=['Residential','Mixed Use','Commercial','Institutional','Vacant Urban Plot']
ZONES=['Residential R2','Commercial C2','Mixed Use MU','Public/Semi-Public']
STATUS=['AVAILABLE','AVAILABLE','PARTIAL','N/D','AVAILABLE','N/A']

def get_conn(): return psycopg2.connect(POSTGIS_DSN)

def parcel_seed():
    for i in range(24):
        n=i+1
        yield {'parcel_id':f'PUNE-KOT-DEMO-{n:03d}','ulpin':None,'district':'Pune','taluka':'Pune City','locality':['Kothrud','Kothrud-South'][i%2],
               'survey_number':f'D-{68+i//6}/{i%6+1}','gat_number':None,'hissa_number':str(i%3+1),'cts_number':f'K-D{200+i:04d}',
               'property_uid':f'DEMOUID{n:08d}','area_m2':round(95+((i*37)%410)+(i%5)*0.5,2),'holder_demo':HOLDERS[i%8],
               'land_type':LAND_TYPES[i%5],'zone':ZONES[i%4],'data_status':STATUS[i%6],
               'geometry_status':'N/D — authorized cadastral geometry not publicly retrievable for this pilot'}

def ensure_schema(conn):
    with conn.cursor() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS canonical_parcels(
          id BIGSERIAL PRIMARY KEY, parcel_id TEXT UNIQUE NOT NULL, ulpin TEXT, district TEXT NOT NULL, taluka TEXT,
          locality TEXT, survey_number TEXT, gat_number TEXT, hissa_number TEXT, cts_number TEXT, property_uid TEXT,
          area_m2 DOUBLE PRECISION, holder_demo TEXT, land_type TEXT, zone TEXT, geometry geometry(MultiPolygon,4326),
          centroid geometry(Point,4326), source_id TEXT, source_record_id TEXT, data_status TEXT NOT NULL,
          geometry_status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());''')
        c.execute('CREATE INDEX IF NOT EXISTS canonical_parcels_geom_gix ON canonical_parcels USING GIST(geometry)')
        c.execute('CREATE INDEX IF NOT EXISTS canonical_parcels_search_idx ON canonical_parcels(survey_number,cts_number,property_uid)')
        c.execute('''CREATE TABLE IF NOT EXISTS government_source_records(
          id BIGSERIAL PRIMARY KEY, parcel_id TEXT NOT NULL REFERENCES canonical_parcels(parcel_id) ON DELETE CASCADE,
          source_id TEXT NOT NULL, source_name TEXT NOT NULL, department TEXT NOT NULL, source_url TEXT NOT NULL,
          source_type TEXT NOT NULL, retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(), record_identifier TEXT NOT NULL,
          parcel_identifier TEXT, category TEXT NOT NULL, data_status TEXT NOT NULL, is_fictional BOOLEAN NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb, UNIQUE(parcel_id,source_id,category));''')
        c.execute('CREATE INDEX IF NOT EXISTS gov_records_parcel_idx ON government_source_records(parcel_id)')
        c.execute('''CREATE TABLE IF NOT EXISTS parcel_alu_link(
          id BIGSERIAL PRIMARY KEY, parcel_id TEXT NOT NULL REFERENCES canonical_parcels(parcel_id) ON DELETE CASCADE,
          alu_id TEXT NOT NULL, relationship_type TEXT NOT NULL, intersection_area_m2 DOUBLE PRECISION,
          intersection_percentage DOUBLE PRECISION, source_geometry TEXT NOT NULL, assignment_method TEXT NOT NULL,
          confidence DOUBLE PRECISION NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(parcel_id,alu_id));''')
        c.execute('CREATE INDEX IF NOT EXISTS parcel_alu_link_alu_idx ON parcel_alu_link(alu_id)')
    conn.commit()

def make_payload(p,svc,i):
    if svc=='land_records': return {'district':p['district'],'taluka':p['taluka'],'village_or_peth':p['locality'],'survey_number':p['survey_number'],'hissa_number':p['hissa_number'],'ulpin':None,'property_uid':p['property_uid'],'record_type':'7/12 / Property Card reference','account_reference':f'DEMO-KHATA-{i+1:04d}','land_classification':p['land_type'],'record_holder':p['holder_demo'],'share':'1/1','ferfar_reference':f'DEMO-FERFAR-2026-{i+1:04d}','remarks':'Fictional demo record; government ULPIN not imported.'}
    if svc=='registration': return {'deed_number':f'DEMO-DEED-{i+1:04d}','registration_date':f'202{4+i%3}-{i%9+1:02d}-{i%26+1:02d}','document_type':['Sale Deed','Leave & License','Gift Deed'][i%3],'property_description':f'Demo urban property, {p["locality"]}','survey_gat_cts_reference':p['survey_number'],'village':p['locality'],'sub_registrar_office':'Pune City Demo SRO','transaction_value_inr':4250000+i*375000,'market_value_inr':5100000+i*420000,'consideration_value_inr':4100000+i*360000,'party_type':'Demo fictional parties','registration_status':'Registered' if p['data_status']!='N/D' else 'N/D'}
    if svc=='planning_building': return {'proposal_number':f'DEMO/PMC/BP/2026/{i+101:04d}','property_id':p['property_uid'],'survey_number':p['survey_number'],'plot_number':f'P-{i+1:03d}','village':p['locality'],'land_use_zone':p['zone'],'proposal_type':['New Construction','Addition','Occupancy'][i%3],'building_use':p['land_type'],'floors':i%5+1,'sanctioned_area_m2':round(p['area_m2']*(0.55+(i%4)*0.05),2),'approval_date':f'202{4+i%3}-{i%9+1:02d}-15','application_status':['Approved','Under Scrutiny','N/D','N/A'][i%4],'gis':{'latitude':None,'longitude':None,'plot_geometry':'N/D'}}
    if svc=='property_tax': return {'property_id':p['property_uid'],'property_tax_number':f'DEMO-TAX-{i+1:06d}','address':f'Kothrud Demo Property {i+1:02d}, Pune','ward_zone':'Kothrud','village_area':p['locality'],'survey_number':p['survey_number'],'plot_number':f'P-{i+1:03d}','property_type':p['land_type'],'usage':'Residential' if p['land_type']=='Residential' else p['land_type'],'floor_unit':f'Unit {i%6+1}','built_up_area_m2':round(p['area_m2']*.72,2),'assessment_year':'2026-27','annual_tax_inr':8200+i*430,'arrears_inr':1250 if i%5==0 else 0,'payment_status':['Paid','Paid','Part Paid','N/D'][i%4],'valuation_rate_inr_m2':78000+i*900,'mutation_status':'Pending demo update' if i%3==0 else 'No pending demo mutation'}
    if svc=='utilities_infrastructure': return {'electricity':'N/D' if i%5==0 else 'Available','water':'Municipal network','sewerage':'N/D' if i%4==0 else 'Connected','drainage':'Available','road_name':f'Demo Internal Road {i%6+1}','road_width_m':round(9+(i%4)*1.5,1),'right_of_way':'Reference only','service_availability':'PARTIAL' if i%4==0 else 'AVAILABLE','network_proximity':{'water_m':55+i*2,'electricity_m':30+i,'sewer_m':80+i*3},'infrastructure_project':f'Kothrud Demo Corridor {2026+i%2}','geometry_reference':'N/D'}
    return {'encumbrance':'Mortgage' if i%4==0 else 'None recorded in demo source','mortgage':{'bank':'Demo Maharashtra Cooperative Bank','charge_amount_inr':4250000+i*25000,'status':'Active'} if i%4==0 else None,'lien':None,'court_stay':'N/D' if i%5==0 else 'None recorded','litigation':'N/D' if i%3==0 else 'None recorded','legal_restriction':'None recorded','transaction_hold':'None','record_status':'N/D' if i%5==0 else 'AVAILABLE'}

def seed_demo(conn,reset=False):
    ensure_schema(conn)
    with conn.cursor() as c:
        c.execute('SELECT COUNT(*) FROM canonical_parcels'); count=c.fetchone()[0]
        if count and not reset: return {'seeded':False,'parcels':count,'message':'Pune demo dataset already present'}
        if reset:
            c.execute('DELETE FROM government_source_records'); c.execute('DELETE FROM parcel_alu_link'); c.execute('DELETE FROM canonical_parcels')
        services=list(SERVICES)
        for i,p in enumerate(parcel_seed()):
            c.execute('''INSERT INTO canonical_parcels(parcel_id,ulpin,district,taluka,locality,survey_number,gat_number,hissa_number,cts_number,property_uid,area_m2,holder_demo,land_type,zone,data_status,geometry_status) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',tuple(p[k] for k in ['parcel_id','ulpin','district','taluka','locality','survey_number','gat_number','hissa_number','cts_number','property_uid','area_m2','holder_demo','land_type','zone','data_status','geometry_status']))
            for svc in services:
                sid=SERVICES[svc]; src=SOURCES[sid]; cat={'land_records':'land_records','registration':'registration_deeds','planning_building':'planning_building','property_tax':'property_tax','utilities_infrastructure':'utility_infrastructure','legal_encumbrance':'legal_encumbrance'}[svc]
                recid=f'DEMO-{svc.upper()}-{i+1:03d}'
                c.execute('''INSERT INTO government_source_records(parcel_id,source_id,source_name,department,source_url,source_type,record_identifier,parcel_identifier,category,data_status,is_fictional,payload) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true,%s)''',(p['parcel_id'],sid,src['source_name'],src['department'],src['url'],'mock_government_source',recid,p['property_uid'],cat,p['data_status'],json.dumps(make_payload(p,svc,i))))
    conn.commit(); return {'seeded':True,'parcels':24,'sources':len(services),'records_per_parcel':6}

def ensure_seeded():
    with get_conn() as conn:
        ensure_schema(conn)
        with conn.cursor() as c: c.execute('SELECT COUNT(*) FROM canonical_parcels'); n=c.fetchone()[0]
        if n==0: seed_demo(conn)

def matches(row,q):
    if not q:return True
    fields=' '.join(str(row.get(k) or '') for k in ('parcel_id','survey_number','gat_number','cts_number','property_uid','locality','holder_demo','ulpin')).lower()
    return all(tok.lower() in fields for tok in q.split())

def list_parcels(q='',limit=50):
    ensure_seeded()
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as c:
        c.execute('''SELECT parcel_id,ulpin,district,taluka,locality,survey_number,gat_number,hissa_number,cts_number,property_uid,area_m2,holder_demo,land_type,zone,data_status,geometry_status,ST_AsGeoJSON(geometry)::json AS geometry FROM canonical_parcels ORDER BY parcel_id LIMIT %s''',(limit,)); rows=[dict(x) for x in c.fetchall()]
    return [r for r in rows if matches(r,q)]

def get_parcel(pid):
    ensure_seeded()
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as c:
        c.execute('''SELECT parcel_id,ulpin,district,taluka,locality,survey_number,gat_number,hissa_number,cts_number,property_uid,area_m2,holder_demo,land_type,zone,data_status,geometry_status,ST_AsGeoJSON(geometry)::json AS geometry FROM canonical_parcels WHERE parcel_id=%s''',(pid,)); r=c.fetchone(); return dict(r) if r else None

def get_records(pid,category=None):
    ensure_seeded()
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as c:
        if category:c.execute('SELECT * FROM government_source_records WHERE parcel_id=%s AND category=%s ORDER BY id',(pid,category))
        else:c.execute('SELECT * FROM government_source_records WHERE parcel_id=%s ORDER BY id',(pid,))
        rows=[dict(x) for x in c.fetchall()]
    return rows

def get_all_information(pid):
    p=get_parcel(pid)
    if not p:return None
    alu=get_alu_link(pid); records=get_records(pid); cats={}
    for r in records: cats[r['category']]={'status':r['data_status'],'record_id':r['record_identifier'],'source':{'source_id':r['source_id'],'source_name':r['source_name'],'source_url':r['source_url']},'is_fictional':r['is_fictional'],'payload':r['payload']}
    return {'parcel':p,'alu':alu,'categories':cats,'provenance':[{'source_id':r['source_id'],'source_name':r['source_name'],'department':r['department'],'record_id':r['record_identifier'],'data_status':r['data_status'],'is_fictional':r['is_fictional']} for r in records],'generated_at':datetime.now(timezone.utc).isoformat()}

def get_alu_link(pid):
    ensure_seeded()
    with get_conn() as conn,conn.cursor(cursor_factory=RealDictCursor) as c:
        c.execute('SELECT * FROM parcel_alu_link WHERE parcel_id=%s ORDER BY id LIMIT 1',(pid,)); r=c.fetchone(); return dict(r) if r else None

def calculate_alu_for_geometry(geojson,level='1m2'):
    geom=shape(geojson)
    if geom.is_empty: raise ValueError('geometry is empty')
    to3857=Transformer.from_crs('EPSG:4326','EPSG:3857',always_xy=True).transform
    g=transform(to3857,geom); pt=g.representative_point(); x,y=pt.x,pt.y
    ix=floor((x-ROOT_ORIGIN_X)/10000); iy=floor((y-ROOT_ORIGIN_Y)/10000)
    if ix<0 or iy<0 or ix>=ROOT_COLS: raise ValueError('geometry is outside configured ALU lattice extent')
    lx=x-(ROOT_ORIGIN_X+ix*10000); ly=y-(ROOT_ORIGIN_Y+iy*10000); path=[]; side=10000.0; depths={'1km2':1,'0.01km2':2,'0.0001km2':3,'0.000001km2':4,'1m2':4,'0.1m2':5}; depth=depths[level]
    for d in range(depth):
        if d<4:
            s=side/10; dx=min(9,max(0,floor(lx/s))); dy=min(9,max(0,floor(ly/s))); path.append(dy*10+dx); lx-=dx*s; ly-=dy*s; side=s
        else:path.append(0); side=0.316227766
    cell=Cell(level,ix,iy,tuple(path)); return {'alu':cell.id,'level':cell.level,'area_m2':cell.area_m2,'path':list(cell.path),'assignment_method':'Deterministic representative-point mapping using backend/spatial_indexing/lattice.py','confidence':1.0}

def attach_geometry(pid,geojson,source):
    ensure_seeded(); geom=shape(geojson)
    if geom.geom_type=='Polygon': geom=MultiPolygon([geom])
    if geom.geom_type!='MultiPolygon': raise ValueError('geometry must be Polygon or MultiPolygon')
    alu=calculate_alu_for_geometry(geojson,'1m2'); to3857=Transformer.from_crs('EPSG:4326','EPSG:3857',always_xy=True).transform; g=transform(to3857,geom); cell=cell_from_id(alu['alu']); x1,y1,x2,y2=cell.mercator_bounds; inter=g.intersection(box(x1,y1,x2,y2)); area=float(inter.area); pct=(area/float(g.area)*100) if g.area else 0.0
    with get_conn() as conn,conn.cursor() as c:
        c.execute("UPDATE canonical_parcels SET geometry=ST_SetSRID(ST_GeomFromGeoJSON(%s),4326),centroid=ST_SetSRID(ST_GeomFromText(%s),4326),geometry_status='AVAILABLE',updated_at=now() WHERE parcel_id=%s",(json.dumps(geojson),f'POINT({geom.centroid.x} {geom.centroid.y})',pid))
        if c.rowcount!=1: raise KeyError(pid)
        c.execute('''INSERT INTO parcel_alu_link(parcel_id,alu_id,relationship_type,intersection_area_m2,intersection_percentage,source_geometry,assignment_method,confidence) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(parcel_id,alu_id) DO UPDATE SET relationship_type=excluded.relationship_type,intersection_area_m2=excluded.intersection_area_m2,intersection_percentage=excluded.intersection_percentage,source_geometry=excluded.source_geometry,assignment_method=excluded.assignment_method,confidence=excluded.confidence''',(pid,alu['alu'],'INTERSECTS' if area else 'CENTROID_IN',area,pct,source,alu['assignment_method'],1.0 if area else 0.0))
        conn.commit()
    return {'parcel_id':pid,**alu,'intersection_area_m2':area,'intersection_percentage':pct,'source_geometry':source}
