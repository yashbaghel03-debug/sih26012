"""
Mock Department: Infrastructure / PWD
Covers: Category 15 (Infrastructure Networks / ROW Buffers)
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.responses import GovResponse
from ..fixtures.loader import get_field

router = APIRouter(prefix="/api/v1/infrastructure", tags=["Infrastructure"])


@router.get("/networks/{parcel_id}", response_model=GovResponse,
            summary="Category 15 — Infrastructure Networks / ROW Buffers")
def get_networks(parcel_id: str):
    data = get_field(parcel_id, "infrastructure", "networks")
    if data is None:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found.")
    return GovResponse(
        status="success",
        parcel_id=parcel_id,
        category_code="INFRA_NETWORKS",
        availability=data.get("availability", "not_found"),
        data=data if data.get("availability") == "available" else None,
        department="PWD / NHAI / GHMC Roads",
        source_reference=data.get("reference"),
        retrieved_at=datetime.utcnow().isoformat() + "Z",
        remarks=data.get("remarks"),
    )
