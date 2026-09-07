"""
Normalizer — Phase 3

Converts the raw JSON response from the mock portal (GovResponse envelope)
into the internal NormalizedRecord format.

Key rule:
    is_usable = True   ONLY when availability == "available"
    is_usable = False  for "na", "nd", "not_found", "error"

This is not a confidence score. It is a binary: did we get usable data?
"""
from datetime import datetime, timezone
from typing import Optional

from .models import NormalizedRecord

USABLE_STATUS = "available"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize(
    raw_response: Optional[dict],
    http_status: int,
    error_message: Optional[str],
    category_code: str,
    category_no: int,
    category_name: str,
    parcel_id: str,
    department: str,
) -> NormalizedRecord:
    """
    Convert a raw portal response into a NormalizedRecord.

    Three cases:
    1. Connection / HTTP error → availability = "error", is_usable = False
    2. Valid response with any availability value → preserve that value
    3. Parcel not found in source → availability = "not_found"
    """

    # Case 1: Error at transport/HTTP level
    if error_message or raw_response is None:
        return NormalizedRecord(
            category_code=category_code,
            category_no=category_no,
            category_name=category_name,
            parcel_id=parcel_id,
            availability="error",
            data=None,
            department=department,
            source_reference=None,
            retrieved_at=_now(),
            remarks=error_message,
            is_usable=False,
            http_status=http_status,
            error_message=error_message,
        )

    # Case 2 & 3: Valid JSON response from portal
    availability = raw_response.get("availability", "not_found")
    is_usable = (availability == USABLE_STATUS)

    # Only keep data payload when actually available
    data = raw_response.get("data") if is_usable else None

    return NormalizedRecord(
        category_code=category_code,
        category_no=category_no,
        category_name=category_name,
        parcel_id=parcel_id,
        availability=availability,
        data=data,
        department=raw_response.get("department", department),
        source_reference=raw_response.get("source_reference"),
        retrieved_at=raw_response.get("retrieved_at", _now()),
        remarks=raw_response.get("remarks"),
        is_usable=is_usable,
        http_status=http_status,
        error_message=None,
    )
