"""
Mock Department: Urban Planning (HMDA / GHMC / DTCP)
Covers: Category 6 (Master Plan), Category 7 (Building Approval),
        Category 8 (Occupancy Certificate), Category 11 (Zoning)
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.responses import GovResponse
from ..fixtures.loader import get_field

router = APIRouter(prefix="/api/v1/planning", tags=["Planning"])


def _build(parcel_id, code, field, dept):
    data = get_field(parcel_id, "planning", field)
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


@router.get("/master-plan/{parcel_id}", response_model=GovResponse,
            summary="Category 6 — Master Plan / Town Layout")
def get_master_plan(parcel_id: str):
    return _build(parcel_id, "MASTER_PLAN", "master_plan",
                  "HMDA / DTCP Telangana")


@router.get("/building-approval/{parcel_id}", response_model=GovResponse,
            summary="Category 7 — Building Plan Permissions / Approvals")
def get_building_approval(parcel_id: str):
    return _build(parcel_id, "BUILDING_APPROVAL", "building_approval",
                  "GHMC / ULB Building Permissions")


@router.get("/occupancy-certificate/{parcel_id}", response_model=GovResponse,
            summary="Category 8 — Completion / Occupancy Certificate")
def get_occupancy_certificate(parcel_id: str):
    return _build(parcel_id, "OCCUPANCY_CERT", "occupancy_certificate",
                  "GHMC / ULB")


@router.get("/zoning/{parcel_id}", response_model=GovResponse,
            summary="Category 11 — Land Use Classification / Zoning")
def get_zoning(parcel_id: str):
    return _build(parcel_id, "ZONING", "zoning",
                  "HMDA / DTCP / Zoning Authority")
