"""
Mock Department: Social Welfare
Covers: Category 18 (Service Linkages / Welfare Schemes)
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.responses import GovResponse
from ..fixtures.loader import get_field

router = APIRouter(prefix="/api/v1/welfare", tags=["Welfare"])


@router.get("/service-linkages/{parcel_id}", response_model=GovResponse,
            summary="Category 18 — Service Linkages / Welfare Schemes")
def get_service_linkages(parcel_id: str):
    data = get_field(parcel_id, "welfare", "service_linkages")
    if data is None:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found.")
    return GovResponse(
        status="success",
        parcel_id=parcel_id,
        category_code="SERVICE_LINKAGES",
        availability=data.get("availability", "not_found"),
        data=data if data.get("availability") == "available" else None,
        department="MoSJE / State Welfare Department",
        source_reference=data.get("reference"),
        retrieved_at=datetime.utcnow().isoformat() + "Z",
        remarks=data.get("remarks"),
    )
