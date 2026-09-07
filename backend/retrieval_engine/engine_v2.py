"""Phase 6 — assignment engine with status resolution."""
from __future__ import annotations
from .connector import fetch_category
from .normalizer import normalize
from .grader import compute_grade
from .models import NormalizedRecord,ParcelRetrievalResult
from .resolver import resolve_record
from ..source_registry.registry import all_categories
DEFAULT_BASE_URL="http://localhost:8001"
def retrieve_parcel(parcel_id:str,base_url:str=DEFAULT_BASE_URL,*,parcel_type:str|None=None,verbose:bool=False)->ParcelRetrievalResult:
    records:dict[str,NormalizedRecord]={}
    for category_code,config in all_categories():
        raw,http_status,error=fetch_category(parcel_id,category_code,base_url)
        record=normalize(raw,http_status,error,category_code,config["category_no"],config["category_name"],parcel_id,config["department"])
        records[category_code]=resolve_record(record,parcel_type=parcel_type)
        if verbose:print(f"[{config['category_no']:02d}] {category_code:<22} {records[category_code].availability}")
    usable_count,color=compute_grade(records)
    return ParcelRetrievalResult(parcel_id=parcel_id,records=records,usable_count=usable_count,color=color)
