from pydantic import BaseModel
from typing import Any, Optional
from datetime import datetime


class GovResponse(BaseModel):
    """Standard response envelope for all mock government endpoints."""

    status: str                         # "success" | "error"
    parcel_id: str
    category_code: str                  # e.g. "ULPIN", "ROR", "BUILDING_APPROVAL"
    availability: str                   # "available" | "na" | "nd" | "not_found"
    data: Optional[Any] = None          # The actual record, or None
    department: str                     # Simulated issuing department
    source_reference: Optional[str] = None
    retrieved_at: str = datetime.utcnow().isoformat() + "Z"
    remarks: Optional[str] = None


class ParcelSummary(BaseModel):
    """Summary record returned by /parcels/{parcel_id}."""

    parcel_id: str
    ulpin: str
    description: str
    land_type: str
    area_sq_m: float
    location: dict
    score: int                          # how many of 21 categories are usable
    color: str                          # "green" | "yellow" | "red"
