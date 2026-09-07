"""
Government Data Retrieval & Spatial Assignment Engine — Phase 3

Core pipeline for one parcel:
    parcel_id
       ↓
    source registry   (which endpoint for each category)
       ↓
    connector         (HTTP GET to mock portal)
       ↓
    normalizer        (raw JSON → NormalizedRecord)
       ↓
    grader            (count usable → GREEN/YELLOW/RED)
       ↓
    ParcelRetrievalResult

Phase 6 will add: PostGIS spatial lookup and DB write-back.
Phase 8 will add: Round-based batch processing over the full grid.
"""
import json
from typing import Optional

from .connector import fetch_category
from .normalizer import normalize
from .grader import compute_grade, grade_breakdown
from .models import NormalizedRecord, ParcelRetrievalResult
from ..source_registry.registry import all_categories, get_category

DEFAULT_BASE_URL = "http://localhost:8001"

# ── Core retrieval function ───────────────────────────────────────────────────

def retrieve_parcel(
    parcel_id: str,
    base_url: str = DEFAULT_BASE_URL,
    verbose: bool = False,
) -> ParcelRetrievalResult:
    """
    Retrieve all 21 categories for a parcel and return graded result.

    Deterministic flow:
      For each category in registry order (1 → 21):
        1. Build URL
        2. HTTP GET to mock portal
        3. Normalize response
        4. Store NormalizedRecord

      Then count usable → assign color.

    Args:
        parcel_id : e.g. "PA-HY-2024-001"
        base_url  : mock portal base URL
        verbose   : print progress to stdout

    Returns:
        ParcelRetrievalResult with all 21 records + grade
    """
    records: dict[str, NormalizedRecord] = {}

    if verbose:
        print(f"\n{'─'*65}")
        print(f"  Retrieving: {parcel_id}  |  Source: {base_url}")
        print(f"{'─'*65}")

    for category_code, config in all_categories():

        raw_data, http_status, error = fetch_category(
            parcel_id=parcel_id,
            category_code=category_code,
            base_url=base_url,
        )

        record = normalize(
            raw_response=raw_data,
            http_status=http_status,
            error_message=error,
            category_code=category_code,
            category_no=config["category_no"],
            category_name=config["category_name"],
            parcel_id=parcel_id,
            department=config["department"],
        )

        records[category_code] = record

        if verbose:
            print(
                f"  [{config['category_no']:2d}] {category_code:<22}"
                f" {record.availability:<12} {record.display_status}"
            )

    usable_count, color = compute_grade(records)
    result = ParcelRetrievalResult(
        parcel_id=parcel_id,
        records=records,
        usable_count=usable_count,
        color=color,
    )

    if verbose:
        breakdown = grade_breakdown(records)
        print(f"\n  Score   : {usable_count}/21")
        print(f"  Color   : {color.upper()}")
        print(f"  Breakdown: available={breakdown['available']} | "
              f"N/A={breakdown['na']} | N/D={breakdown['nd']} | "
              f"error={breakdown['error']}")

    return result


# ── Batch retrieval ───────────────────────────────────────────────────────────

def retrieve_parcels(
    parcel_ids: list[str],
    base_url: str = DEFAULT_BASE_URL,
    verbose: bool = True,
) -> dict[str, ParcelRetrievalResult]:
    """
    Run retrieval for a list of parcel IDs.
    Returns dict of parcel_id → ParcelRetrievalResult.
    """
    results = {}
    for parcel_id in parcel_ids:
        results[parcel_id] = retrieve_parcel(parcel_id, base_url=base_url, verbose=verbose)

    if verbose:
        _print_summary(results)

    return results


def retrieve_all_demo_parcels(
    base_url: str = DEFAULT_BASE_URL,
    verbose: bool = True,
) -> dict[str, ParcelRetrievalResult]:
    """Convenience: run retrieval for all 5 demo parcels."""
    demo_parcels = [
        "PA-HY-2024-001",
        "PB-HY-2024-002",
        "PC-HY-2024-003",
        "PD-HY-2024-004",
        "PE-HY-2024-005",
    ]
    return retrieve_parcels(demo_parcels, base_url=base_url, verbose=verbose)


# ── Result export ─────────────────────────────────────────────────────────────

def export_result_json(result: ParcelRetrievalResult, path: Optional[str] = None) -> str:
    """
    Serialize a ParcelRetrievalResult to JSON.
    If path is given, also writes to file.
    Returns the JSON string.
    """
    data = result.to_dict()
    output = json.dumps(data, indent=2, ensure_ascii=False)
    if path:
        with open(path, "w") as f:
            f.write(output)
    return output


# ── Internal helpers ──────────────────────────────────────────────────────────

def _print_summary(results: dict[str, ParcelRetrievalResult]) -> None:
    print(f"\n{'═'*55}")
    print("  RETRIEVAL SUMMARY")
    print(f"{'═'*55}")
    print(f"  {'Parcel ID':<22} {'Score':>7}  {'Color'}")
    print(f"  {'─'*50}")
    for pid, r in results.items():
        color_tag = {"green": "🟢", "yellow": "🟡", "red": "🔴"}.get(r.color, "⬜")
        print(f"  {pid:<22} {r.usable_count:>4}/21   {color_tag} {r.color.upper()}")
    print()
