"""Field-completeness classification for Pune ALU demo cells."""
from __future__ import annotations
from functools import lru_cache
from typing import Any
from .alu_catalog import cell_details, list_cells, pilot_parent, _one_m_cell

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


@lru_cache(maxsize=2)
def compact_coverage_grid(level: str = "1m2") -> dict[str, Any]:
    """Compact, DB-free map payload for the Pune 100x100 pilot grid."""
    if level != "1m2":
        raise ValueError("compact coverage grid currently supports 1m2")
    parent = pilot_parent()
    cells: list[dict[str, Any]] = []
    counts = {"GREEN": 0, "YELLOW": 0, "RED": 0, "WHITE": 0}
    for row in range(100):
        for col in range(100):
            cell = _one_m_cell(parent, row, col)
            detail = cell_details(cell.id)
            available, status = classify_field_statuses(detail.get("fields", []))
            counts[status] += 1
            cells.append({"alu_id": cell.id, "row": row, "col": col, "available_fields": available, "status": status})
    return {
        "level": "1m2",
        "rows": 100,
        "cols": 100,
        "count": 10000,
        "items": cells,
        "status_labels": STATUS_LABELS,
        "status_counts": counts,
        "bbox": compact_bbox(parent),
        "white_cells": 0,
    }


def compact_bbox(cell) -> list[list[float]]:
    from pyproj import Transformer
    x1, y1, x2, y2 = cell.mercator_bounds
    tr = Transformer.from_crs(3857, 4326, always_xy=True)
    west, south = tr.transform(x1, y1)
    east, north = tr.transform(x2, y2)
    return [[south, west], [north, east]]
