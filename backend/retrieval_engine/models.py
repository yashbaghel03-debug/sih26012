"""
Retrieval Engine — Data Models

NormalizedRecord  : one category's result for one parcel
ParcelRetrievalResult : full result for a parcel across all 21 categories
"""
from dataclasses import dataclass, field
from typing import Optional, Any
from datetime import datetime, timezone


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class NormalizedRecord:
    """
    Standard internal representation of a single retrieved category.

    availability values:
        "available"  — data retrieved successfully                → is_usable = True
        "na"         — Not Applicable (category doesn't apply)   → is_usable = False
        "nd"         — Not Disclosed (exists but restricted)     → is_usable = False
        "not_found"  — parcel not found in source                → is_usable = False
        "error"      — connection/HTTP error during retrieval    → is_usable = False
    """
    category_code: str
    category_no: int
    category_name: str
    parcel_id: str
    availability: str
    data: Optional[Any]
    department: str
    source_reference: Optional[str]
    retrieved_at: str
    remarks: Optional[str]
    is_usable: bool
    http_status: Optional[int] = None
    error_message: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "category_code": self.category_code,
            "category_no": self.category_no,
            "category_name": self.category_name,
            "parcel_id": self.parcel_id,
            "availability": self.availability,
            "data": self.data,
            "department": self.department,
            "source_reference": self.source_reference,
            "retrieved_at": self.retrieved_at,
            "remarks": self.remarks,
            "is_usable": self.is_usable,
            "http_status": self.http_status,
            "error_message": self.error_message,
        }

    @property
    def display_status(self) -> str:
        """Short human-readable status for table display."""
        if self.availability == "available":
            return "✓"
        elif self.availability == "na":
            return "N/A"
        elif self.availability == "nd":
            return "N/D"
        elif self.availability == "error":
            return "ERR"
        else:
            return "?"


@dataclass
class ParcelRetrievalResult:
    """
    Full retrieval result for one parcel across all 21 categories.

    color:
        "green"  → 18-21 usable
        "yellow" → 15-17 usable
        "red"    → <15 usable
    """
    parcel_id: str
    records: dict               # category_code → NormalizedRecord
    usable_count: int
    color: str
    total_categories: int = 21
    retrieved_at: str = field(default_factory=_now_utc)

    def to_dict(self) -> dict:
        return {
            "parcel_id": self.parcel_id,
            "usable_count": self.usable_count,
            "total_categories": self.total_categories,
            "color": self.color,
            "retrieved_at": self.retrieved_at,
            "records": {k: v.to_dict() for k, v in self.records.items()},
        }

    def summary_rows(self) -> list[tuple]:
        """Return list of (no, code, name, status) for printing."""
        rows = []
        for code, rec in sorted(
            self.records.items(), key=lambda x: x[1].category_no
        ):
            rows.append((rec.category_no, code, rec.category_name, rec.display_status))
        return rows
