"""Phase 5 — deterministic N/A vs N/D status resolver."""
from __future__ import annotations
from dataclasses import replace
from typing import Iterable
from .models import NormalizedRecord
NA_RULES={"PA-HY-2024-001":(),"PB-HY-2024-002":("SERVICE_LINKAGES",),"PC-HY-2024-003":("MORTGAGE","MASTER_PLAN","BUILDING_APPROVAL","OCCUPANCY_CERT","PROPERTY_TAX"),"PD-HY-2024-004":("SERVICE_LINKAGES",),"PE-HY-2024-005":("GEOREF_IMAGERY","CHANGE_DETECTION","INFRA_NETWORKS","SERVICE_LINKAGES")}
PARCEL_TYPE_RULES=(("agricultural",("MORTGAGE","MASTER_PLAN","BUILDING_APPROVAL","OCCUPANCY_CERT","PROPERTY_TAX")),("flat",("GEOREF_IMAGERY","CHANGE_DETECTION","INFRA_NETWORKS")))
def applicable_na_categories(parcel_id:str,parcel_type:str|None)->set[str]:
    if parcel_id in NA_RULES:return set(NA_RULES[parcel_id])
    if not parcel_type:return set()
    result=set()
    text=parcel_type.lower()
    for token,categories in PARCEL_TYPE_RULES:
        if token in text:result.update(categories)
    return result
def resolve_record(record:NormalizedRecord,*,parcel_type:str|None=None)->NormalizedRecord:
    if record.category_code in applicable_na_categories(record.parcel_id,parcel_type):
        if record.availability!="na":
            return replace(record,availability="na",data=None,source_reference=None,is_usable=False,remarks=record.remarks or "N/A — category is not applicable at this parcel type/granularity.")
    if record.availability in {"nd","na"}:return replace(record,data=None,is_usable=False)
    return record
def resolve_records(records:Iterable[NormalizedRecord],*,parcel_type:str|None=None)->list[NormalizedRecord]:
    return [resolve_record(r,parcel_type=parcel_type) for r in records]
