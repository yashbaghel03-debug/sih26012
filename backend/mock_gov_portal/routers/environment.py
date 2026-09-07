"""
Mock Department: Environment / Forest (TSPCB / MoEF)
Covers: Category 16 (Env Buffers / Forest Zones),
        Category 17 (Restriction Zones: CRZ / Defence / Heritage)
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.responses import GovResponse
from ..fixtures.loader import get_field

router = APIRouter(prefix="/api/v1/environment", tags=["Environment"])


def _build(parcel_id, code, field, dept):
    data = get_field(parcel_id, "environment", field)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found.")
    return GovResponse(
        status="success",
        parcel_id=parcel_id,
        category_code=code,
        availability=data.get("availability", "not_found"),
        data=data if data.get("availability") == "available" else None,
        department=dept,
        source_reference=data.get("reference"),
        retrieved_at=datetime.utcnow().isoformat() + "Z",
        remarks=data.get("remarks"),
    )


@router.get("/buffers/{parcel_id}", response_model=GovResponse,
            summary="Category 16 — Environmental Buffers / Forest Zones")
def get_env_buffers(parcel_id: str):
    return _build(parcel_id, "ENV_BUFFERS", "env_buffers",
                  "TSPCB / MoEF / Forest Department")


@router.get("/restriction-zones/{parcel_id}", response_model=GovResponse,
            summary="Category 17 — Restriction Zones (CRZ / Defence / Heritage)")
def get_restriction_zones(parcel_id: str):
    return _build(parcel_id, "RESTRICTION_ZONES", "restriction_zones",
                  "MoEF / Ministry of Defence / ASI / AAI")
