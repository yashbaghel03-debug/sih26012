"""
Mock Department: Internal System / Workflow
Covers: Category 21 (Workflow Logs / Transaction Tracking)
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..models.responses import GovResponse
from ..fixtures.loader import get_field

router = APIRouter(prefix="/api/v1/workflow", tags=["Workflow"])


@router.get("/logs/{parcel_id}", response_model=GovResponse,
            summary="Category 21 — Workflow Logs / Transaction Tracking")
def get_workflow_logs(parcel_id: str):
    data = get_field(parcel_id, "workflow", "transaction_logs")
    if data is None:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found.")
    return GovResponse(
        status="success",
        parcel_id=parcel_id,
        category_code="WORKFLOW_LOGS",
        availability=data.get("availability", "not_found"),
        data=data if data.get("availability") == "available" else None,
        department="ALU Engine / Internal Audit",
        source_reference=data.get("log_reference"),
        retrieved_at=datetime.utcnow().isoformat() + "Z",
        remarks=data.get("remarks"),
    )
