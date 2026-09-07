"""
Mock Department: Municipal (GHMC / ULB)
Covers: Category 13 (Property Tax), Category 14 sub (Municipal Valuation)
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.responses import GovResponse
from ..fixtures.loader import get_field

router = APIRouter(prefix="/api/v1/municipal", tags=["Municipal"])


def _build(parcel_id, code, field, dept):
    data = get_field(parcel_id, "municipal", field)
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


@router.get("/property-tax/{parcel_id}", response_model=GovResponse,
            summary="Category 13 — Property Taxation / Arrears")
def get_property_tax(parcel_id: str):
    return _build(parcel_id, "PROPERTY_TAX", "property_tax",
                  "GHMC / Greater Hyderabad Municipal Corporation")


@router.get("/assessment/{parcel_id}", response_model=GovResponse,
            summary="Category 14 (Municipal) — Property Assessment Valuation")
def get_assessment(parcel_id: str):
    return _build(parcel_id, "MUNICIPAL_VALUATION", "valuation",
                  "GHMC Assessment & Collection Wing")
