from backend.retrieval_engine.normalizer import to_standard_schema
from backend.retrieval_engine.resolver import applicable_na_categories,resolve_record
from backend.retrieval_engine.models import NormalizedRecord
from backend.spatial_indexing.lattice import Cell,children,ancestor_1km

def test_standard_schema_keys():
    r=NormalizedRecord("ULPIN",1,"ULPIN","P","available",{"x":1},"D","REF","T",None,True)
    assert set(to_standard_schema(r))=={"category","value","status","source_ref","retrieved_at"}
def test_na_rules():
    assert "MASTER_PLAN" in applicable_na_categories("PC-HY-2024-003","Agricultural")
    assert "SERVICE_LINKAGES" in applicable_na_categories("PD-HY-2024-004","Urban Commercial")
    assert "GEOREF_IMAGERY" in applicable_na_categories("PE-HY-2024-005","Urban Residential - Flat")
def test_nd_is_preserved():
    r=NormalizedRecord("MORTGAGE",10,"Mortgage","PB-HY-2024-002","nd",None,"D",None,"T","restricted",False)
    x=resolve_record(r,parcel_type="Urban Commercial")
    assert x.availability=="nd" and not x.is_usable
def test_fine_cells():
    root=Cell("1km",0,-1)
    fine=list(children(Cell("1m",70,-20)))
    assert len(fine)==10 and all(c.area_m2==0.1 for c in fine)
    assert ancestor_1km(fine[0])==root
