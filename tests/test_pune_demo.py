from backend.pune_demo.store import parcel_seed
from backend.spatial_indexing.lattice import Cell


def test_pune_seed_is_deterministic_and_24_records():
    first = list(parcel_seed())
    second = list(parcel_seed())
    assert len(first) == 24
    assert first == second
    assert all(x["geometry_status"].startswith("N/D") for x in first)
    assert all(x["ulpin"] is None for x in first)
    assert first[0]["parcel_id"] == "PUNE-KOT-DEMO-001"
    assert first[-1]["parcel_id"] == "PUNE-KOT-DEMO-024"


def test_existing_alu_remains_deterministic():
    a = Cell("1km2", 12, 34, (56,))
    b = Cell("1km2", 12, 34, (56,))
    assert a.id == b.id
    assert a.area_m2 == 1_000_000.0
