"""
Grader — Phase 3

Determines color classification from usable category count.

This is NOT an AI confidence score.
It is a direct count of how many of the 21 defined information
categories returned availability == "available".

Thresholds (from project spec):
    GREEN  → 18-21 usable
    YELLOW → 15-17 usable
    RED    → <15 usable
    WHITE  → cell not yet visited/processed (handled by the map layer)
"""
from .models import NormalizedRecord

GREEN_MIN = 18
YELLOW_MIN = 15


def grade(usable_count: int) -> str:
    """
    Return color string for a given usable category count.
    WHITE is not returned here — it is the default map state
    before any retrieval runs.
    """
    if usable_count >= GREEN_MIN:
        return "green"
    elif usable_count >= YELLOW_MIN:
        return "yellow"
    else:
        return "red"


def compute_grade(records: dict[str, NormalizedRecord]) -> tuple[int, str]:
    """
    Given the full dict of category_code → NormalizedRecord,
    return (usable_count, color).
    """
    usable_count = sum(1 for r in records.values() if r.is_usable)
    color = grade(usable_count)
    return usable_count, color


def grade_breakdown(records: dict[str, NormalizedRecord]) -> dict:
    """
    Return a detailed breakdown of all availability statuses.
    Useful for the information panel in the frontend.
    """
    breakdown = {"available": 0, "na": 0, "nd": 0, "not_found": 0, "error": 0}
    for rec in records.values():
        key = rec.availability if rec.availability in breakdown else "error"
        breakdown[key] += 1
    return breakdown
