"""
Integration Test — Retrieval Pipeline

Runs all 5 demo parcels through the full retrieval engine
and verifies scores match expected values.

Usage (from project root):
    # Step 1: start the mock portal
    uvicorn backend.mock_gov_portal.main:app --port 8001

    # Step 2: in a separate terminal
    cd <project_root>
    python -m backend.retrieval_engine.test_pipeline
"""
import sys
import os

# Allow running as: python -m backend.retrieval_engine.test_pipeline
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.retrieval_engine.engine import retrieve_all_demo_parcels

# Expected outcomes (score, color) per parcel
EXPECTED: dict[str, tuple[int, str]] = {
    "PA-HY-2024-001": (21, "green"),
    "PB-HY-2024-002": (17, "yellow"),
    "PC-HY-2024-003": (12, "red"),
    "PD-HY-2024-004": (14, "red"),
    "PE-HY-2024-005": (16, "yellow"),
}

BASE_URL = os.environ.get("MOCK_PORTAL_URL", "http://localhost:8001")


def run_tests() -> bool:
    print("=" * 65)
    print("  SIH 2026 — Retrieval Pipeline Integration Test")
    print(f"  Mock portal: {BASE_URL}")
    print("=" * 65)

    results = retrieve_all_demo_parcels(base_url=BASE_URL, verbose=True)

    print("\n" + "=" * 65)
    print("  TEST RESULTS")
    print("=" * 65)

    all_passed = True
    for parcel_id, result in results.items():
        exp_score, exp_color = EXPECTED[parcel_id]
        score_ok = result.usable_count == exp_score
        color_ok = result.color == exp_color
        passed = score_ok and color_ok
        all_passed = all_passed and passed

        status = "✓ PASS" if passed else "✗ FAIL"
        print(
            f"  [{status}]  {parcel_id}"
            f"  score={result.usable_count} (exp {exp_score})"
            f"  color={result.color} (exp {exp_color})"
        )

        if not passed:
            print("           Non-usable categories:")
            for code, rec in sorted(result.records.items(), key=lambda x: x[1].category_no):
                if not rec.is_usable:
                    print(f"             [{rec.category_no:2d}] {code:<22} → {rec.availability}  {rec.remarks or ''}")

    print()
    if all_passed:
        print("  ✓ All tests PASSED.")
    else:
        print("  ✗ Some tests FAILED. Check fixture data and endpoint mappings.")

    return all_passed


if __name__ == "__main__":
    ok = run_tests()
    sys.exit(0 if ok else 1)
