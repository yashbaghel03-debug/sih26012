"""
Mock Department: Land Records (DILRMP / State Land Records)
Covers: Category 1 (ULPIN), Category 4 (Record of Rights)
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.responses import GovResponse
from ..fixtures.loader import get_field

router = APIRouter(prefix="/api/v1/land-records", tags=["Land Records"])


def _build_response(parcel_id: str, category_code: str, section: str,
                    field: str, department: str) -> GovResponse:
    data = get_field(parcel_id, section, field)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found.")
    return GovResponse(
        status="success",
        parcel_id=parcel_id,
        category_code=category_code,
        availability=data.get("availability", "not_found"),
        data=data if data.get("availability") == "available" else None,
        department=department,
        source_reference=data.get("reference"),
        retrieved_at=datetime.utcnow().isoformat() + "Z",
        remarks=data.get("remarks"),
    )


@router.get("/ulpin/{parcel_id}", response_model=GovResponse,
            summary="Category 1 — ULPIN record for a parcel")
def get_ulpin(parcel_id: str):
    """
    Returns the Unique Land Parcel Identification Number (ULPIN)
    and associated survey metadata for the given parcel.
    """
    return _build_response(
        parcel_id, "ULPIN", "land_records", "ulpin",
        "DILRMP / Telangana Land Records Department"
    )


@router.get("/ror/{parcel_id}", response_model=GovResponse,
            summary="Category 4 — Record of Rights (RoR)")
def get_ror(parcel_id: str):
    """
    Returns the Record of Rights (Pahani / RoR) for the given parcel.
    Includes ownership, khata number, land type, and extent.
    """
    return _build_response(
        parcel_id, "ROR", "land_records", "ror",
        "Telangana Revenue Department / MeeSeva"
    )
