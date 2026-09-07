"""
Source Registry — Phase 2

Maps each of the 21 category codes to:
  - category number (1-21)
  - category name
  - mock portal endpoint template
  - responsible department

This is the authoritative source-to-category mapping.
The retrieval engine uses this registry to know exactly where
to fetch each piece of information. No AI inference needed —
the mapping is explicit and deterministic.
"""
import json
import os
from functools import lru_cache
from typing import Optional

REGISTRY_PATH = os.path.join(os.path.dirname(__file__), "registry.json")


@lru_cache(maxsize=1)
def load_registry() -> dict:
    """Load and cache the registry JSON. Called once per process."""
    with open(REGISTRY_PATH, "r") as f:
        return json.load(f)


def get_category(category_code: str) -> Optional[dict]:
    """
    Return config for one category code, or None if unknown.
    Example: get_category("ULPIN") → {category_no, category_name, endpoint, department}
    """
    return load_registry().get(category_code)


def all_categories() -> list[tuple[str, dict]]:
    """
    Return all 21 (category_code, config) pairs in category_no order.
    Used by the engine to iterate deterministically.
    """
    reg = load_registry()
    return sorted(reg.items(), key=lambda x: x[1]["category_no"])


def build_url(category_code: str, parcel_id: str, base_url: str) -> Optional[str]:
    """
    Build the full endpoint URL for a given category and parcel.
    Example: build_url("ULPIN", "PA-HY-2024-001", "http://localhost:8001")
             → "http://localhost:8001/api/v1/land-records/ulpin/PA-HY-2024-001"
    """
    config = get_category(category_code)
    if not config:
        return None
    endpoint = config["endpoint"].replace("{parcel_id}", parcel_id)
    return f"{base_url.rstrip('/')}{endpoint}"


def print_registry() -> None:
    """Print the full registry as a readable table (for debugging)."""
    print(f"\n{'#':>3}  {'Code':<22} {'Endpoint':<55} Department")
    print("-" * 120)
    for code, cfg in all_categories():
        print(f"{cfg['category_no']:>3}  {code:<22} {cfg['endpoint']:<55} {cfg['department']}")


if __name__ == "__main__":
    print_registry()
