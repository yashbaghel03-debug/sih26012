"""
Mock Department: Registration (IGR / Sub-Registrar Office)
Covers: Category 5 (Deeds), Category 9 (Encumbrances),
        Category 10 (Mortgage), Category 14 (Valuation)
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.responses import GovResponse
from ..fixtures.loader import get_field

router = APIRouter(prefix="/api/v1/registration", tags=["Registration"])


def _build(parcel_id, code, field, dept):
    data = get_field(parcel_id, "registration", field)
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


@router.get("/deeds/{parcel_id}", response_model=GovResponse,
            summary="Category 5 — Registration Deeds / Title Chain")
def get_deeds(parcel_id: str):
    return _build(parcel_id, "REGISTRATION_DEEDS", "deeds",
                  "Inspector General of Registration, Telangana (IGR)")


@router.get("/encumbrances/{parcel_id}", response_model=GovResponse,
            summary="Category 9 — Encumbrances / Charges")
def get_encumbrances(parcel_id: str):
    return _build(parcel_id, "ENCUMBRANCES", "encumbrances",
                  "Inspector General of Registration, Telangana (IGR)")


@router.get("/mortgage/{parcel_id}", response_model=GovResponse,
            summary="Category 10 — Active Bank Mortgages / Liens")
def get_mortgage(parcel_id: str):
    return _build(parcel_id, "MORTGAGE", "mortgage",
                  "Inspector General of Registration / CERSAI")


@router.get("/valuation/{parcel_id}", response_model=GovResponse,
            summary="Category 14 — Valuation / Circle Rates")
def get_valuation(parcel_id: str):
    return _build(parcel_id, "VALUATION", "valuation",
                  "Inspector General of Registration, Telangana (IGR)")
