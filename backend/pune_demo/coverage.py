"""Field-completeness classification for Pune ALU demo cells.

The map color is derived from the 21 information fields shown in ALU Details:
19-21 usable fields -> GREEN, 15-18 -> YELLOW, 0-14 -> RED.
WHITE is reserved for a deliberately unsearched/controversial boundary area;
this Pune demo does not assign WHITE to any catalog cell because all demo ALUs
are given deterministic field-level results.
"""
from __future__ import annotations

from typing import Any

from .alu_catalog import cell_details, list_cells

STATUS_LABELS = {
    "GREEN": "Green — 19–21 of 21 fields available",
    "YELLOW": "Yellow — 15–18 of 21 fields available",
    "RED": "Red — fewer than 15 of 21 fields available",
    "WHITE": "White — area not searched / controversial boundary",
}


def classify_field_statuses(fields: list[dict[str, Any]]) -> tuple[int, str]:
    available = sum(1 for field in fields if field.get("status") not in {"N/D", "N/A"})
    if available >= 19:
        return available, "GREEN"
    if available >= 15:
        return available, "YELLOW"
    return available, "RED"


def classify_alu(alu_id: str) -> dict[str, Any]:
    details = cell_details(alu_id)
    available, status = classify_field_statuses(details.get("fields", []))
    details["available_fields"] = available
    details["total_fields"] = 21
    details["coverage_status"] = status
    details["coverage_label"] = STATUS_LABELS[status]
    details["searched"] = True
    return details


def coverage_cells(conn, level: str = "1m2", limit: int = 10_000, offset: int = 0) -> dict[str, Any]:
    base = list_cells(conn, level, limit, offset)
    items = []
    for item in base["items"]:
        detail = cell_details(item["alu_id"])
        available, status = classify_field_statuses(detail.get("fields", []))
        item["status"] = status
        item["available_fields"] = available
        item["total_fields"] = 21
        item["coverage_label"] = STATUS_LABELS[status]
        items.append(item)
    return {
        "level": level,
        "count": len(items),
        "items": items,
        "status_labels": STATUS_LABELS,
        "rule": "GREEN=19-21, YELLOW=15-18, RED=0-14, WHITE=not searched/controversial boundary",
    }
