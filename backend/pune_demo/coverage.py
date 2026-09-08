"""Field-completeness classification for the Pune ALU pilot.

The detail record and the seven mock government portals share the same seeded
fictional source bundle. Geographic context remains real; property attributes
are explicitly fictional demo records.
"""
from __future__ import annotations
from functools import lru_cache
from typing import Any
from .alu_catalog import list_cells, pilot_parent, _one_m_cell
from .realistic_records import field_bundle, fast_field_count

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
    details = field_bundle(alu_id)
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
        available = fast_field_count(item["alu_id"])
        item["status"] = "GREEN" if available >= 19 else "YELLOW" if available >= 15 else "RED"
        item["available_fields"] = available
        item["total_fields"] = 21
        item["coverage_label"] = STATUS_LABELS[item["status"]]
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
    """Compact DB-free 100x100 grid using the same linked field-status rules as ALU details."""
    if level != "1m2":
        raise ValueError("compact coverage grid currently supports 1m2")
    parent = pilot_parent()
    cells: list[dict[str, Any]] = []
    counts = {"GREEN": 0, "YELLOW": 0, "RED": 0, "WHITE": 0}
    for row in range(100):
        for col in range(100):
            alu_id = _one_m_cell(parent, row, col).id
            available = fast_field_count(alu_id)
            status = "GREEN" if available >= 19 else "YELLOW" if available >= 15 else "RED"
            counts[status] += 1
            cells.append({
                "alu_id": alu_id,
                "row": row,
                "col": col,
                "available_fields": available,
                "total_fields": 21,
                "status": status,
            })
    return {
        "level": "1m2",
        "rows": 100,
        "cols": 100,
        "count": 10_000,
        "items": cells,
        "status_labels": STATUS_LABELS,
        "status_counts": counts,
        "bbox": _bbox(parent),
        "white_cells": 0,
        "rule": "GREEN=19-21, YELLOW=15-18, RED=0-14, WHITE=not searched/controversial boundary",
    }


def _bbox(cell) -> list[list[float]]:
    from pyproj import Transformer
    x1, y1, x2, y2 = cell.mercator_bounds
    tr = Transformer.from_crs(3857, 4326, always_xy=True)
    west, south = tr.transform(x1, y1)
    east, north = tr.transform(x2, y2)
    return [[south, west], [north, east]]
