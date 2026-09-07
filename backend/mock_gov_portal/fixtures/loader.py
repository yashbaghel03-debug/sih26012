"""
Fixture loader for the mock government portal.
Reads per-parcel JSON files and serves data to routers.
"""
import json
import os
from functools import lru_cache
from typing import Optional

FIXTURES_DIR = os.path.dirname(__file__)

# Map parcel_id → fixture filename
PARCEL_FILE_MAP = {
    "PA-HY-2024-001": "parcel_a.json",
    "PB-HY-2024-002": "parcel_b.json",
    "PC-HY-2024-003": "parcel_c.json",
    "PD-HY-2024-004": "parcel_d.json",
    "PE-HY-2024-005": "parcel_e.json",
}


@lru_cache(maxsize=10)
def load_parcel(parcel_id: str) -> Optional[dict]:
    """
    Load and cache fixture data for a given parcel_id.
    Returns None if parcel is not found.
    """
    filename = PARCEL_FILE_MAP.get(parcel_id)
    if not filename:
        return None

    filepath = os.path.join(FIXTURES_DIR, filename)
    if not os.path.exists(filepath):
        return None

    with open(filepath, "r") as f:
        return json.load(f)


def get_section(parcel_id: str, section: str) -> Optional[dict]:
    """
    Get a specific section (department) from a parcel's fixture.
    E.g. get_section("PA-HY-2024-001", "land_records")
    """
    parcel = load_parcel(parcel_id)
    if parcel is None:
        return None
    return parcel.get(section)


def get_field(parcel_id: str, section: str, field: str) -> Optional[dict]:
    """
    Get a specific field within a section.
    E.g. get_field("PA-HY-2024-001", "land_records", "ror")
    """
    section_data = get_section(parcel_id, section)
    if section_data is None:
        return None
    return section_data.get(field)


def list_all_parcels() -> list[dict]:
    """Return summary metadata for all demo parcels."""
    summaries = []
    for parcel_id in PARCEL_FILE_MAP:
        parcel = load_parcel(parcel_id)
        if parcel:
            summaries.append({
                "parcel_id": parcel_id,
                "ulpin": parcel.get("ulpin", "N/A"),
                "description": parcel.get("description", ""),
                "land_type": parcel.get("land_type", ""),
                "area_sq_m": parcel.get("area_sq_m", 0),
                "location": parcel.get("location", {}),
                "score": parcel.get("score", 0),
                "color": parcel.get("color", "white"),
            })
    return summaries
