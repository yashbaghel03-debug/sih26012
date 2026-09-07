"""
Mock Department: Survey / Remote Sensing (TSSDI / NRSC)
Covers: Category 2 (Cadastral Map), Category 3 (Imagery),
        Category 20 (Change Detection)
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.responses import GovResponse
from ..fixtures.loader import get_field

router = APIRouter(prefix="/api/v1/survey", tags=["Survey"])


def _build(parcel_id, code, field, dept):
    data = get_field(parcel_id, "survey", field)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found.")
    return GovResponse(
        status="success",
        parcel_id=parcel_id,
        category_code=code,
        availability=data.get("availability", "not_found"),
        data=data if data.get("availability") == "available" else None,
        department=dept,
        source_reference=data.get("reference") or data.get("layer_reference"),
        retrieved_at=datetime.utcnow().isoformat() + "Z",
        remarks=data.get("remarks"),
    )


@router.get("/cadastral/{parcel_id}", response_model=GovResponse,
            summary="Category 2 — Cadastral Map / Parcel Boundary")
def get_cadastral(parcel_id: str):
    return _build(parcel_id, "CADASTRAL_MAP", "cadastral",
                  "TSSDI / Telangana State Spatial Data Infrastructure")


@router.get("/imagery/{parcel_id}", response_model=GovResponse,
            summary="Category 3 — Georeferenced Satellite / Base Imagery")
def get_imagery(parcel_id: str):
    return _build(parcel_id, "GEOREF_IMAGERY", "imagery",
                  "NRSC Bhuvan / ISRO")


@router.get("/change-detection/{parcel_id}", response_model=GovResponse,
            summary="Category 20 — Satellite / Drone Change Detection")
def get_change_detection(parcel_id: str):
    return _build(parcel_id, "CHANGE_DETECTION", "change_detection",
                  "NRSC / Drone Survey")
