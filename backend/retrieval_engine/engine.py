"""Phase 6 — deterministic 21-category assignment engine."""
from __future__ import annotations
import json
from typing import Optional
from .engine_v2 import DEFAULT_BASE_URL, retrieve_parcel
from .grader import grade_breakdown
from .models import ParcelRetrievalResult
DEMO_PARCELS=["PA-HY-2024-001","PB-HY-2024-002","PC-HY-2024-003","PD-HY-2024-004","PE-HY-2024-005"]
def retrieve_parcels(parcel_ids:list[str],base_url:str=DEFAULT_BASE_URL,verbose:bool=True)->dict[str,ParcelRetrievalResult]:
    results={pid:retrieve_parcel(pid,base_url=base_url,verbose=verbose) for pid in parcel_ids}
    if verbose:
        print("\nRETRIEVAL SUMMARY")
        for pid,result in results.items(): print(f"{pid}: {result.usable_count}/21 {result.color.upper()}")
    return results
def retrieve_all_demo_parcels(base_url:str=DEFAULT_BASE_URL,verbose:bool=True)->dict[str,ParcelRetrievalResult]:
    return retrieve_parcels(DEMO_PARCELS,base_url=base_url,verbose=verbose)
def export_result_json(result:ParcelRetrievalResult,path:Optional[str]=None)->str:
    output=json.dumps(result.to_dict(),indent=2,ensure_ascii=False)
    if path:
        with open(path,"w",encoding="utf-8") as f:f.write(output)
    return output
def assignment_summary(result:ParcelRetrievalResult)->dict:
    return {"parcel_id":result.parcel_id,"usable_count":result.usable_count,"total_categories":result.total_categories,"color":result.color,"breakdown":grade_breakdown(result.records)}
