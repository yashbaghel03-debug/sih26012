from backend.pune_demo.alu_catalog import _one_m_cell, pilot_parent
from backend.spatial_indexing.lattice import Cell, cell_from_id


def test_pune_catalog_has_10000_unique_one_m_alus_and_100000_terminal_children():
    parent = pilot_parent()
    one_m = [_one_m_cell(parent, row, col) for row in range(100) for col in range(100)]
    one_ids = [cell.id for cell in one_m]
    assert len(one_ids) == 10_000
    assert len(set(one_ids)) == 10_000
    assert all(cell_from_id(value).level == "1m2" for value in one_ids)

    terminal_ids = [
        Cell("0.1m2", cell.root_ix, cell.root_iy, cell.path + (terminal_index,)).id
        for cell in one_m
        for terminal_index in range(10)
    ]
    assert len(terminal_ids) == 100_000
    assert len(set(terminal_ids)) == 100_000
    assert all(cell_from_id(value).level == "0.1m2" for value in terminal_ids)
