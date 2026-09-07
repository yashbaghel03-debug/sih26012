"""
Mock Department: Utilities (HMWSSB / TSSPDCL / MGL)
Covers: Category 12 (Utility Infrastructure)
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.responses import GovResponse
from ..fixtures.loader import get_field

router = APIRouter(prefix="/api/v1/utilities", tags=["Utilities"])


@router.get("/infrastructure/{parcel_id}", response_model=GovResponse,
            summary="Category 12 — Utility Infrastructure")
def get_utility_infrastructure(parcel_id: str):
    data = get_field(parcel_id, "utilities", "infrastructure")
    if data is None:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found.")
    return GovResponse(
        status="success",
        parcel_id=parcel_id,
        category_code="UTILITY_INFRA",
        availability=data.get("availability", "not_found"),
        data=data if data.get("availability") == "available" else None,
        department="HMWSSB / TSSPDCL / GHMC",
        source_reference=data.get("reference"),
        retrieved_at=datetime.utcnow().isoformat() + "Z",
        remarks=data.get("remarks"),
    )
