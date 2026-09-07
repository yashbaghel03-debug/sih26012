"""
Mock Department: Judicial / eCourts
Covers: Category 19 (Pending Litigation / Court Stays)
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.responses import GovResponse
from ..fixtures.loader import get_field

router = APIRouter(prefix="/api/v1/judicial", tags=["Judicial"])


@router.get("/litigation/{parcel_id}", response_model=GovResponse,
            summary="Category 19 — Pending Litigation / Court Stays")
def get_litigation(parcel_id: str):
    data = get_field(parcel_id, "judicial", "litigation")
    if data is None:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found.")
    return GovResponse(
        status="success",
        parcel_id=parcel_id,
        category_code="LITIGATION",
        availability=data.get("availability", "not_found"),
        data=data if data.get("availability") == "available" else None,
        department="eCourts / NIC Judicial Services",
        source_reference=data.get("reference"),
        retrieved_at=datetime.utcnow().isoformat() + "Z",
        remarks=data.get("remarks"),
    )
