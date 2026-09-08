"""Deterministic Pune demo ALU catalog.

ALU is the project's spatial index, separate from government ULPIN and cadastral
geometry. The pilot catalog materializes 10,000 one-square-metre ALUs and their
100,000 logical 0.1 m² terminal children inside a real Kothrud geographic context.
No parcel polygon is fabricated.
"""
from __future__ import annotations
from datetime import datetime, timezone
from hashlib import sha256
from math import floor
from typing import Any
from psycopg2.extras import RealDictCursor, execute_values
from pyproj import Transformer
from ..spatial_indexing.lattice import Cell, ROOT_ORIGIN_X, ROOT_ORIGIN_Y

CATALOG_TABLE = "pune_demo_alu_cells"
PILOT_CENTER = (18.5074, 73.8077)
STATUS_LABELS = {
    "AVAILABLE": "Green — available / strong demo source coverage",
    "PARTIAL": "Yellow — partial / mixed availability",
    "N/D": "Red — N/D / not publicly verified",
    "N/A": "Grey — N/A / not applicable",
}
_TO_MERC = Transformer.from_crs(4326, 3857, always_xy=True)
_FROM_MERC = Transformer.from_crs(3857, 4326, always_xy=True)


def _root_and_parent_path(lat: float, lon: float) -> tuple[int, int, tuple[int, int]]:
    x, y = _TO_MERC.transform(lon, lat)
    rx = floor((x - ROOT_ORIGIN_X) / 10_000.0)
    ry = floor((y - ROOT_ORIGIN_Y) / 10_000.0)
    if rx < 0 or rx >= 400 or ry < 0:
        raise ValueError("Pilot center is outside the configured deterministic ALU lattice")
    root_x, root_y = ROOT_ORIGIN_X + rx * 10_000.0, ROOT_ORIGIN_Y + ry * 10_000.0
    local_x, local_y = x - root_x, y - root_y
    km_ix, km_iy = max(0, min(9, floor(local_x / 1000.0))), max(0, min(9, floor(local_y / 1000.0)))
    rem_x, rem_y = local_x - km_ix * 1000.0, local_y - km_iy * 1000.0
    h_ix, h_iy = max(0, min(9, floor(rem_x / 100.0))), max(0, min(9, floor(rem_y / 100.0)))
    return rx, ry, (km_iy * 10 + km_ix, h_iy * 10 + h_ix)


def pilot_parent() -> Cell:
    rx, ry, parent_path = _root_and_parent_path(*PILOT_CENTER)
    return Cell("0.01km2", rx, ry, parent_path)


def status_for_index(row: int, col: int) -> str:
    value = (row * 37 + col * 17 + row * col * 3) % 100
    if value < 55: return "AVAILABLE"
    if value < 82: return "PARTIAL"
    if value < 96: return "N/D"
    return "N/A"


def terminal_status(parent_status: str, terminal_index: int) -> str:
    if terminal_index == 9 and parent_status == "AVAILABLE": return "PARTIAL"
    if terminal_index == 7 and parent_status == "PARTIAL": return "N/D"
    if terminal_index == 5 and parent_status == "N/D": return "N/A"
    return parent_status


def _bbox(cell: Cell) -> list[list[float]]:
    x1, y1, x2, y2 = cell.mercator_bounds
    west, south = _FROM_MERC.transform(x1, y1)
    east, north = _FROM_MERC.transform(x2, y2)
    return [[south, west], [north, east]]


def _one_m_cell(parent: Cell, row: int, col: int) -> Cell:
    ten_m_index = (row // 10) * 10 + (col // 10)
    one_m_index = (row % 10) * 10 + (col % 10)
    return Cell("1m2", parent.root_ix, parent.root_iy, parent.path + (ten_m_index, one_m_index))


def ensure_catalog_schema(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(f"""CREATE TABLE IF NOT EXISTS {CATALOG_TABLE} (
            id BIGSERIAL PRIMARY KEY,
            alu_id TEXT NOT NULL UNIQUE,
            level TEXT NOT NULL,
            parent_alu TEXT,
            row_index INTEGER NOT NULL,
            col_index INTEGER NOT NULL,
            status TEXT NOT NULL,
            source_count INTEGER NOT NULL DEFAULT 0,
            demo_note TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")
        cur.execute(f"CREATE INDEX IF NOT EXISTS {CATALOG_TABLE}_level_idx ON {CATALOG_TABLE}(level)")
        cur.execute(f"CREATE INDEX IF NOT EXISTS {CATALOG_TABLE}_parent_idx ON {CATALOG_TABLE}(parent_alu)")
    conn.commit()


def seed_catalog(conn, reset: bool = False) -> dict[str, Any]:
    ensure_catalog_schema(conn)
    parent = pilot_parent()
    with conn.cursor() as cur:
        if reset: cur.execute(f"DELETE FROM {CATALOG_TABLE}")
        cur.execute(f"SELECT COUNT(*) FROM {CATALOG_TABLE} WHERE level='1m2'")
        one_count = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {CATALOG_TABLE} WHERE level='0.1m2'")
        terminal_count = cur.fetchone()[0]
    if one_count == 10_000 and terminal_count == 100_000 and not reset:
        return catalog_stats(conn)

    one_rows, terminal_rows = [], []
    source_counts = {"AVAILABLE": 8, "PARTIAL": 5, "N/D": 3, "N/A": 0}
    for row in range(100):
        for col in range(100):
            one_m = _one_m_cell(parent, row, col)
            status = status_for_index(row, col)
            one_rows.append((one_m.id, "1m2", parent.id, row, col, status, source_counts[status], "Fictional demo coverage status; not a cadastral classification."))
            for terminal_index in range(10):
                terminal = Cell("0.1m2", parent.root_ix, parent.root_iy, one_m.path + (terminal_index,))
                t_status = terminal_status(status, terminal_index)
                terminal_rows.append((terminal.id, "0.1m2", one_m.id, row, col, t_status, source_counts[t_status], "Logical terminal demo child; not a claim of survey accuracy."))
    with conn.cursor() as cur:
        execute_values(cur, f"""INSERT INTO {CATALOG_TABLE}
          (alu_id,level,parent_alu,row_index,col_index,status,source_count,demo_note)
          VALUES %s ON CONFLICT (alu_id) DO UPDATE SET parent_alu=EXCLUDED.parent_alu,
          row_index=EXCLUDED.row_index,col_index=EXCLUDED.col_index,status=EXCLUDED.status,
          source_count=EXCLUDED.source_count,demo_note=EXCLUDED.demo_note""", one_rows, page_size=1000)
        execute_values(cur, f"""INSERT INTO {CATALOG_TABLE}
          (alu_id,level,parent_alu,row_index,col_index,status,source_count,demo_note)
          VALUES %s ON CONFLICT (alu_id) DO UPDATE SET parent_alu=EXCLUDED.parent_alu,
          row_index=EXCLUDED.row_index,col_index=EXCLUDED.col_index,status=EXCLUDED.status,
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
        "pilot": "Kothrud / Kothrud-South, Pune", "parent_alu": parent.id,
        "parent_level": parent.level, "parent_area_m2": parent.area_m2,
        "counts": counts, "required_minimum": {"1m2": 10_000, "0.1m2": 100_000},
        "status_labels": STATUS_LABELS, "status_counts": {"1m2": status_1m, "0.1m2": status_terminal},
        "bbox": _bbox(parent),
        "note": "ALU cells are project-generated deterministic spatial indexes, not official cadastral parcels or government identifiers.",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def list_cells(conn, level: str = "1m2", limit: int = 10_000, offset: int = 0) -> dict[str, Any]:
    if level not in {"1m2", "0.1m2"}: raise ValueError("level must be 1m2 or 0.1m2")
    seed_catalog(conn, False)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(f"SELECT alu_id,level,parent_alu,row_index,col_index,status,source_count,demo_note FROM {CATALOG_TABLE} WHERE level=%s ORDER BY row_index,col_index,alu_id LIMIT %s OFFSET %s", (level, limit, offset))
        items = [dict(row) for row in cur.fetchall()]
    parent = pilot_parent()
    for item in items:
        cell = _one_m_cell(parent, item["row_index"], item["col_index"])
        if level == "1m2":
            item["bbox"] = _bbox(cell)
        else:
            item["terminal_index"] = int(cell_from_id(item["alu_id"]).path[-1])
            item["parent_bbox"] = _bbox(cell)
    return {"level": level, "count": len(items), "items": items, "status_labels": STATUS_LABELS}


def cell_from_id(value: str) -> Cell:
    from ..spatial_indexing.lattice import cell_from_id as parse_cell
    return parse_cell(value)


def _stable_int(alu_id: str, slot: int = 0) -> int:
    digest = sha256(f"{alu_id}|{slot}".encode("utf-8")).hexdigest()
    return int(digest[:12], 16)


def _field(status: str, label: str, value: str, source: str = "Demo reconciliation layer") -> dict[str, str]:
    return {"label": label, "value": value, "status": status, "source": source}


def cell_details(alu_id: str) -> dict[str, Any]:
    """Return a complete deterministic 21-field demo record for any catalog ALU."""
    cell = cell_from_id(alu_id)
    if cell.level not in {"1m2", "0.1m2"}:
        raise ValueError("ALU details are available for the Pune 1m2 and 0.1m2 catalog levels")
    h = lambda slot=0: _stable_int(cell.id, slot)
    overall = ["AVAILABLE", "PARTIAL", "N/D", "AVAILABLE", "PARTIAL"][h(99) % 5]
    if overall == "N/D" and h(100) % 7 == 0: overall = "N/A"
    locality = ["Kothrud", "Kothrud-South", "Paud Road", "Karve Road edge"][h(1) % 4]
    holder = ["Aarav Kulkarni", "Ishita Deshmukh", "Rohan Patil", "Mira Joshi", "Kabir Pawar", "Nandini Bhosale"][h(2) % 6]
    lat = 18.4945 + (h(3) % 2600) / 100000.0
    lon = 73.7935 + (h(4) % 3000) / 100000.0
    area = 1.0 if cell.level == "1m2" else 0.1
    field_statuses = [overall] * 21
    for i in (4, 8, 11, 15, 18):
        if h(i + 200) % 4 == 0: field_statuses[i] = "N/D"
    for i in (2, 7, 13, 16):
        if h(i + 300) % 5 == 0: field_statuses[i] = "N/A"
    fields = [
        _field(field_statuses[0], "1. Ownership (RoR)", f"{holder} — DEMO HOLDER\nS/o Demo Holder"),
        _field(field_statuses[1], "2. Land Use", ["Residential (Urban)", "Mixed Use", "Commercial", "Institutional"][h(5) % 4]),
        _field(field_statuses[2], "3. Land Type", ["Private (Freehold)", "Leasehold", "Municipal", "N/A — service/utility strip"][h(6) % 4]),
        _field(field_statuses[3], "4. Area", f"{area:g} m² (ALU cell)"),
        _field(field_statuses[4], "5. Cadastral Map", ["Demo Sheet KTH-01 / Plot reference", "N/D — cadastral map record not publicly verified", "N/A — no cadastral geometry linked"][h(7) % 3]),
        _field(field_statuses[5], "6. Registration Details", f"DEMO-REG-{100000 + h(8) % 899999}"),
        _field(field_statuses[6], "7. Deed Type", ["Sale Deed", "Gift Deed", "Leave & License", "N/D"][h(9) % 4]),
        _field(field_statuses[7], "8. Registration Date", ["18 Jan 2025", "03 Aug 2024", "27 Nov 2023", "N/A — no matching demo deed"][h(10) % 4]),
        _field(field_statuses[8], "9. Encumbrance", ["None recorded", "Mortgage — DEMO BANK", "N/D — charge search unavailable"][h(11) % 3]),
        _field(field_statuses[9], "10. Litigation", ["None recorded", "N/D — court linkage unavailable", "Case reference DEMO-CIV-2025-" + str(100 + h(12) % 800), "N/A"][h(13) % 4]),
        _field(field_statuses[10], "11. Building Permission", f"BP/DEMO/PMC/{2023 + h(14) % 4}/{1000 + h(15) % 8999}"),
        _field(field_statuses[11], "12. Occupancy Certificate", ["OC/DEMO/PMC/2025/" + str(100 + h(16) % 899), "N/D — certificate not retrieved", "N/A — vacant/demo use"][h(17) % 3]),
        _field(field_statuses[12], "13. Property Tax", ["Paid (2025-26)", "Part Paid", "N/D — assessment unavailable"][h(18) % 3]),
        _field(field_statuses[13], "14. Tax ID / PID", f"DEMO-PID-{1000000 + h(19) % 8999999}"),
        _field(field_statuses[14], "15. Zoning / Land Use Zone", ["Residential R2", "Mixed Use MU", "Commercial C2", "Public / Semi-Public"][h(20) % 4]),
        _field(field_statuses[15], "16. Infrastructure", ["Road + storm-water drain", "Road only", "N/D — network geometry unavailable"][h(21) % 3]),
        _field(field_statuses[16], "17. Utilities", ["Electricity + Water", "Water only", "N/D — utility geometry unavailable", "N/A — service not applicable"][h(22) % 4]),
        _field(field_statuses[17], "18. Environmental Zone", ["Not in Eco-Sensitive Zone", "Buffer check: Partial", "N/D — environmental layer unavailable"][h(23) % 3]),
        _field(field_statuses[18], "19. Restriction Zone", ["None recorded", "Heritage buffer — demo", "N/D — defence/heritage layer unavailable", "N/A"][h(24) % 4]),
        _field(field_statuses[19], "20. Market Value", f"₹{(38500 + h(25) % 28000):,} / m² (demo circle-rate style attribute)"),
        _field(field_statuses[20], "21. AI-Derived Info", ["Building: Yes | Floors: 2 | Change: None", "Building: Possible | Floors: N/D | Change: Minor", "N/D — imagery inference not generated"][h(26) % 3], "Demo analytics layer"),
    ]
    return {
        "alu": cell.id,
        "level": cell.level,
        "area_m2": cell.area_m2,
        "parent_alu": pilot_parent().id,
        "ulpin": "N/D — government ULPIN not imported into fictional demo",
        "location": {"locality": locality, "district": "Pune", "state": "Maharashtra", "lat": round(lat, 7), "lng": round(lon, 7)},
        "grid_level": "1 m²" if cell.level == "1m2" else "0.1 m²",
        "accuracy": "±0.05 m display tolerance — not a survey accuracy claim",
        "ai_confidence": f"{72 + h(27) % 25}%",
        "last_updated": f"{10 + h(28) % 18:02d} May 2026 {8 + h(29) % 11:02d}:{h(30) % 60:02d}",
        "overall_status": overall,
        "fields": fields,
        "path": list(cell.path),
        "bbox": _bbox(cell),
        "note": "All values are deterministic fictional demo attributes for reconciliation testing. Government websites/sources are workflow references, not sources of these demo values.",
    }
