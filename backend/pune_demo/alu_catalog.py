"""Deterministic Pune demo ALU catalog.

The catalog is deliberately separate from cadastral parcels: ALU is the project's
spatial index, while cadastral geometry/ULPIN remain government identifiers/data.
This module materializes a compact, deterministic pilot tree containing exactly
10,000 one-square-metre ALUs and their 100,000 logical 0.1 m² terminal children.
No parcel geometry is fabricated.
"""
from __future__ import annotations

from datetime import datetime, timezone
from math import floor
from typing import Any

from psycopg2.extras import execute_values, RealDictCursor
from pyproj import Transformer

from ..spatial_indexing.lattice import Cell, ROOT_ORIGIN_X, ROOT_ORIGIN_Y

CATALOG_TABLE = "pune_demo_alu_cells"
PILOT_CENTER = (18.5074, 73.8077)
STATUS_ORDER = ("AVAILABLE", "PARTIAL", "N/D", "N/A")
STATUS_LABELS = {
    "AVAILABLE": "Green — available / strong demo source coverage",
    "PARTIAL": "Yellow — partial / mixed availability",
    "N/D": "Red — N/D / not publicly verified",
    "N/A": "Grey — N/A / not applicable",
}
_TO_MERC = Transformer.from_crs(4326, 3857, always_xy=True)
_FROM_MERC = Transformer.from_crs(3857, 4326, always_xy=True)


def _root_and_path_for_point(lat: float, lon: float) -> tuple[int, int, tuple[int, int]]:
    x, y = _TO_MERC.transform(lon, lat)
    rx = floor((x - ROOT_ORIGIN_X) / 10_000.0)
    ry = floor((y - ROOT_ORIGIN_Y) / 10_000.0)
    if rx < 0 or rx >= 400 or ry < 0:
        raise ValueError("Pilot center falls outside configured deterministic ALU lattice")
    root_x = ROOT_ORIGIN_X + rx * 10_000.0
    root_y = ROOT_ORIGIN_Y + ry * 10_000.0
    local_x = x - root_x
    local_y = y - root_y
    km_ix = max(0, min(9, floor(local_x / 1_000.0)))
    km_iy = max(0, min(9, floor(local_y / 1_000.0)))
    rem_x = local_x - km_ix * 1_000.0
    rem_y = local_y - km_iy * 1_000.0
    hundred_ix = max(0, min(9, floor(rem_x / 100.0)))
    hundred_iy = max(0, min(9, floor(rem_y / 100.0)))
    return rx, ry, (km_iy * 10 + km_ix, hundred_iy * 10 + hundred_ix)


def pilot_parent() -> Cell:
    rx, ry, (km_index, hundred_index) = _root_and_path_for_point(*PILOT_CENTER)
    return Cell("0.01km2", rx, ry, (km_index, hundred_index))


def status_for_index(row: int, col: int) -> str:
    # Deterministic but intentionally imperfect coverage for QA/demo purposes.
    score = (row * 37 + col * 17 + row * col * 3) % 100
    if score < 55:
        return "AVAILABLE"
    if score < 82:
        return "PARTIAL"
    if score < 96:
        return "N/D"
    return "N/A"


def terminal_status(parent_status: str, terminal_index: int) -> str:
    # Most terminal children inherit parent status; a few are deliberately
    # degraded to exercise reconciliation and N/D/N/A handling.
    if terminal_index == 9 and parent_status == "AVAILABLE":
        return "PARTIAL"
    if terminal_index == 7 and parent_status == "PARTIAL":
        return "N/D"
    return parent_status


def _cell_bbox(cell: Cell) -> list[list[float]]:
    x1, y1, x2, y2 = cell.mercator_bounds
    west, south = _FROM_MERC.transform(x1, y1)
    east, north = _FROM_MERC.transform(x2, y2)
    return [[south, west], [north, east]]


def ensure_catalog_schema(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            f"""CREATE TABLE IF NOT EXISTS {CATALOG_TABLE} (
                id BIGSERIAL PRIMARY KEY,
                alu_id TEXT NOT NULL UNIQUE,
                level TEXT NOT NULL,
                parent_alu TEXT,
                row_index INTEGER NOT NULL,
                col_index INTEGER NOT NULL,
                status TEXT NOT NULL,
                source_count INTEGER NOT NULL DEFAULT 0,
                demo_note TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(level, row_index, col_index, alu_id)
            )"""
        )
        cur.execute(f"CREATE INDEX IF NOT EXISTS {CATALOG_TABLE}_level_idx ON {CATALOG_TABLE}(level)")
        cur.execute(f"CREATE INDEX IF NOT EXISTS {CATALOG_TABLE}_parent_idx ON {CATALOG_TABLE}(parent_alu)")
    conn.commit()


def seed_catalog(conn, reset: bool = False) -> dict[str, Any]:
    ensure_catalog_schema(conn)
    parent = pilot_parent()
    rows: list[tuple[Any, ...]] = []
    for row in range(100):
        for col in range(100):
            path = parent.path + (row * 10 + col // 10, col % 10)
            cell = Cell("1m2", parent.root_ix, parent.root_iy, path)
            status = status_for_index(row, col)
            rows.append((cell.id, "1m2", parent.id, row, col, status, {"AVAILABLE": 8, "PARTIAL": 5, "N/D": 3, "N/A": 1}[status], "Fictional demo coverage status; not a cadastral classification."))
    terminal_rows: list[tuple[Any, ...]] = []
    for row in range(100):
        for col in range(100):
            parent_path = parent.path + (row * 10 + col // 10, col % 10)
            one_m = Cell("1m2", parent.root_ix, parent.root_iy, parent_path)
            parent_status = status_for_index(row, col)
            for terminal_index in range(10):
                terminal = Cell("0.1m2", parent.root_ix, parent.root_iy, parent_path + (terminal_index,))
                terminal_rows.append((terminal.id, "0.1m2", one_m.id, row, col, terminal_status(parent_status, terminal_index), {"AVAILABLE": 8, "PARTIAL": 5, "N/D": 3, "N/A": 1}.get(terminal_status(parent_status, terminal_index), 0), "Logical terminal demo child; not a claim of survey accuracy."))

    with conn.cursor() as cur:
        if reset:
            cur.execute(f"DELETE FROM {CATALOG_TABLE}")
        cur.execute(f"SELECT COUNT(*) FROM {CATALOG_TABLE} WHERE level='1m2'")
        one_m_count = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {CATALOG_TABLE} WHERE level='0.1m2'")
        terminal_count = cur.fetchone()[0]

    if one_m_count == 10_000 and terminal_count == 100_000 and not reset:
        return catalog_stats(conn)

    with conn.cursor() as cur:
        execute_values(cur, f"""INSERT INTO {CATALOG_TABLE}
            (alu_id,level,parent_alu,row_index,col_index,status,source_count,demo_note)
            VALUES %s ON CONFLICT (alu_id) DO UPDATE SET status=EXCLUDED.status,
            parent_alu=EXCLUDED.parent_alu,row_index=EXCLUDED.row_index,col_index=EXCLUDED.col_index,
            source_count=EXCLUDED.source_count,demo_note=EXCLUDED.demo_note""", rows, page_size=1000)
        execute_values(cur, f"""INSERT INTO {CATALOG_TABLE}
            (alu_id,level,parent_alu,row_index,col_index,status,source_count,demo_note)
            VALUES %s ON CONFLICT (alu_id) DO UPDATE SET status=EXCLUDED.status,
            parent_alu=EXCLUDED.parent_alu,row_index=EXCLUDED.row_index,col_index=EXCLUDED.col_index,
            source_count=EXCLUDED.source_count,demo_note=EXCLUDED.demo_note""", terminal_rows, page_size=5000)
    conn.commit()
    return catalog_stats(conn)


def catalog_stats(conn) -> dict[str, Any]:
    ensure_catalog_schema(conn)
    parent = pilot_parent()
    with conn.cursor() as cur:
        cur.execute(f"SELECT level, COUNT(*) FROM {CATALOG_TABLE} GROUP BY level ORDER BY level")
        counts = {level: count for level, count in cur.fetchall()}
        cur.execute(f"SELECT status, COUNT(*) FROM {CATALOG_TABLE} WHERE level='1m2' GROUP BY status ORDER BY status")
        status_1m = {status: count for status, count in cur.fetchall()}
        cur.execute(f"SELECT status, COUNT(*) FROM {CATALOG_TABLE} WHERE level='0.1m2' GROUP BY status ORDER BY status")
        status_terminal = {status: count for status, count in cur.fetchall()}
    return {
        "pilot": "Kothrud / Kothrud-South, Pune",
        "parent_alu": parent.id,
        "parent_level": parent.level,
        "parent_area_m2": parent.area_m2,
        "counts": counts,
        "required_minimum": {"1m2": 10_000, "0.1m2": 100_000},
        "status_labels": STATUS_LABELS,
        "status_counts": {"1m2": status_1m, "0.1m2": status_terminal},
        "bbox": _cell_bbox(parent),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "ALU cells are project-generated deterministic spatial indexes. They are not official cadastral parcels or government identifiers.",
    }


def list_cells(conn, level: str = "1m2", limit: int = 10_000, offset: int = 0) -> dict[str, Any]:
    if level not in {"1m2", "0.1m2"}:
        raise ValueError("level must be 1m2 or 0.1m2")
    seed_catalog(conn, False)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"SELECT alu_id,level,parent_alu,row_index,col_index,status,source_count,demo_note FROM {CATALOG_TABLE} WHERE level=%s ORDER BY row_index,col_index,alu_id LIMIT %s OFFSET %s",
            (level, limit, offset),
        )
        items = [dict(r) for r in cur.fetchall()]
    if level == "1m2":
        parent = pilot_parent()
        for item in items:
            row, col = item["row_index"], item["col_index"]
            path = parent.path + (row * 10 + col // 10, col % 10)
            cell = Cell("1m2", parent.root_ix, parent.root_iy, path)
            item["bbox"] = _cell_bbox(cell)
    return {"level": level, "count": len(items), "items": items, "status_labels": STATUS_LABELS}
