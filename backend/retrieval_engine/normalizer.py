"""Phase 4 — normalize every source response into one internal schema."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from .models import NormalizedRecord
USABLE_STATUS = "available"
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
def normalize(raw_response: Optional[dict], http_status: int, error_message: Optional[str], category_code: str, category_no: int, category_name: str, parcel_id: str, department: str) -> NormalizedRecord:
    if error_message or raw_response is None:
        return NormalizedRecord(category_code, category_no, category_name, parcel_id, "error", None, department, None, _now(), error_message, False, http_status, error_message)
    availability = raw_response.get("availability", "not_found")
    is_usable = availability == USABLE_STATUS
    data = raw_response.get("data") if is_usable else None
    return NormalizedRecord(category_code, category_no, category_name, parcel_id, availability, data, raw_response.get("department", department), raw_response.get("source_reference"), raw_response.get("retrieved_at", _now()), raw_response.get("remarks"), is_usable, http_status, None)
def to_standard_schema(record: NormalizedRecord) -> dict:
    return {"category": record.category_code, "value": record.data, "status": record.availability, "source_ref": record.source_reference, "retrieved_at": record.retrieved_at}
