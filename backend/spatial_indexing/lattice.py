"""Deterministic hierarchical ALU spatial indexing for India WebGIS.

Hierarchy:
    100 km² -> 1 km² -> 0.01 km² -> 0.0001 km² -> 1 m² -> 0.1 m².

The first four refinements are true 10x10 square subdivisions. The final
0.1 m² terminal is represented by ten deterministic equal-area square
footprints because ten congruent irrational-sided squares cannot form a
regular gapless 1 m² square tiling. The terminal footprints are logical
terminal sampling cells.

ALU IDs are opaque hierarchical strings. The root is 6 characters and every
refinement adds one 2-character base36 token. Each token contains a letter
and a number.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from typing import Iterator

BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
DIGITS = "0123456789"

LEVEL_ORDER = ("100km2", "1km2", "0.01km2", "0.0001km2", "0.000001km2", "0.1m2")
LEVEL_SPECS = {
    "100km2": {"side_m": 10_000.0, "children": 100, "kind": "square10x10"},
    "1km2": {"side_m": 1_000.0, "children": 100, "kind": "square10x10"},
    "0.01km2": {"side_m": 100.0, "children": 100, "kind": "square10x10"},
    "0.0001km2": {"side_m": 10.0, "children": 100, "kind": "square10x10"},
    "0.000001km2": {"side_m": 1.0, "children": 10, "kind": "terminal10"},
    "0.1m2": {"side_m": sqrt(0.1), "children": 0, "kind": "terminal"},
}

# Root cells are 10 km x 10 km. This keeps the initial logical coverage
# roughly 1/100 of the former 1 km root count.
ROOT_ORIGIN_X = 7_570_000.0
ROOT_ORIGIN_Y = 700_000.0
ROOT_COLS = 400


def _b36(n: int, width: int) -> str:
    if n < 0:
        raise ValueError("base36 input must be non-negative")
    if n == 0:
        return "0" * width
    out = []
    while n:
        n, r = divmod(n, 36)
        out.append(BASE36[r])
    return "0" * max(0, width - len(out)) + "".join(reversed(out))


def _from_b36(value: str) -> int:
    if not value:
        raise ValueError("empty base36 value")
    n = 0
    for ch in value.upper():
        if ch not in BASE36:
            raise ValueError(f"invalid base36 character: {ch}")
        n = n * 36 + BASE36.index(ch)
    return n


CHILD_TOKENS = tuple(
    f"{a}{b}"
    for a in BASE36
    for b in BASE36
    if (a.isalpha() and b.isdigit()) or (a.isdigit() and b.isalpha())
)[:100]
TOKEN_TO_INDEX = {token: i for i, token in enumerate(CHILD_TOKENS)}

TERMINAL_PLACEMENTS = (
    (0.000, 0.000), (0.340, 0.000), (0.680, 0.000),
    (0.000, 0.340), (0.340, 0.340), (0.680, 0.340),
    (0.000, 0.680), (0.340, 0.680), (0.680, 0.680),
    (0.315, 0.315),
)


def _validate_level(level: str) -> None:
    if level not in LEVEL_SPECS:
        raise ValueError(f"unknown ALU level: {level}")


def root_indices_to_code(ix: int, iy: int) -> str:
    if ix < 0 or ix >= ROOT_COLS or iy < 0:
        raise ValueError("root index outside configured India extent")
    flat = iy * ROOT_COLS + ix
    bucket, remainder = divmod(flat, 36**4)
    if bucket >= 260:
        raise ValueError("root index exceeds six-character ALU capacity")
    letter_index, digit_index = divmod(bucket, 10)
    return f"{ALPHABET[letter_index]}{DIGITS[digit_index]}{_b36(remainder, 4)}"


def code_to_root_indices(code: str) -> tuple[int, int]:
    code = code.upper()
    if len(code) != 6 or not code[0].isalpha() or not code[1].isdigit():
        raise ValueError("root ALU code must be six characters with a letter and number")
    if any(ch not in BASE36 for ch in code):
        raise ValueError("root ALU code must be base36")
    bucket = ALPHABET.index(code[0]) * 10 + DIGITS.index(code[1])
    flat = bucket * 36**4 + _from_b36(code[2:])
    return flat % ROOT_COLS, flat // ROOT_COLS


def child_token(index: int) -> str:
    if index < 0 or index >= 100:
        raise ValueError("child index out of range")
    return CHILD_TOKENS[index]


def child_index(token: str) -> int:
    token = token.upper()
    if token not in TOKEN_TO_INDEX:
        raise ValueError(f"invalid ALU hierarchy token: {token}")
    return TOKEN_TO_INDEX[token]


@dataclass(frozen=True)
class Cell:
    level: str
    root_ix: int
    root_iy: int
    path: tuple[int, ...] = ()

    def __post_init__(self) -> None:
        _validate_level(self.level)
        expected_depth = LEVEL_ORDER.index(self.level)
        if len(self.path) != expected_depth:
            raise ValueError(f"{self.level} requires hierarchy depth {expected_depth}")
        if any(i < 0 or i >= 100 for i in self.path):
            raise ValueError("hierarchy index out of range")
        if self.level == "0.1m2" and self.path[-1] >= 10:
            raise ValueError("final level has exactly ten terminal children")

    @property
    def id(self) -> str:
        return "-".join((root_indices_to_code(self.root_ix, self.root_iy), *(child_token(i) for i in self.path)))

    @property
    def width_m(self) -> float:
        return LEVEL_SPECS[self.level]["side_m"]

    @property
    def height_m(self) -> float:
        return self.width_m

    @property
    def area_m2(self) -> float:
        return self.width_m * self.width_m

    @property
    def root_flat_index(self) -> int:
        return self.root_iy * ROOT_COLS + self.root_ix

    @property
    def local_root_offset(self) -> tuple[float, float]:
        if self.level == "100km2":
            return 0.0, 0.0
        ox = oy = 0.0
        side = 10_000.0
        for index in self.path[:4]:
            child_side = side / 10.0
            ox += (index % 10) * child_side
            oy += (index // 10) * child_side
            side = child_side
        return ox, oy

    @property
    def mercator_bounds(self) -> tuple[float, float, float, float]:
        root_x = ROOT_ORIGIN_X + self.root_ix * 10_000.0
        root_y = ROOT_ORIGIN_Y + self.root_iy * 10_000.0
        if self.level != "0.1m2":
            ox, oy = self.local_root_offset
            side = self.width_m
            return root_x + ox, root_y + oy, root_x + ox + side, root_y + oy + side
        parent = Cell("0.000001km2", self.root_ix, self.root_iy, self.path[:-1])
        px1, py1, _, _ = parent.mercator_bounds
        ox, oy = TERMINAL_PLACEMENTS[self.path[-1]]
        side = sqrt(0.1)
        return px1 + ox, py1 + oy, px1 + ox + side, py1 + oy + side


def cell_id(cell: Cell) -> str:
    return cell.id


def cell_from_id(value: str) -> Cell:
    parts = value.strip().upper().split("-")
    if not parts or len(parts[0]) != 6:
        raise ValueError("invalid hierarchical ALU code")
    root_ix, root_iy = code_to_root_indices(parts[0])
    depth = len(parts) - 1
    if depth < 0 or depth >= len(LEVEL_ORDER):
        raise ValueError("invalid ALU hierarchy depth")
    path = tuple(child_index(token) for token in parts[1:])
    level = LEVEL_ORDER[depth]
    if level == "0.1m2" and (not path or path[-1] >= 10):
        raise ValueError("invalid final ALU child")
    return Cell(level, root_ix, root_iy, path)


def children(cell: Cell) -> Iterator[Cell]:
    index = LEVEL_ORDER.index(cell.level)
    if index == len(LEVEL_ORDER) - 1:
        return
    next_level = LEVEL_ORDER[index + 1]
    count = LEVEL_SPECS[cell.level]["children"]
    for child in range(count):
        yield Cell(next_level, cell.root_ix, cell.root_iy, cell.path + (child,))


def parent(cell: Cell) -> Cell | None:
    index = LEVEL_ORDER.index(cell.level)
    if index == 0:
        return None
    return Cell(LEVEL_ORDER[index - 1], cell.root_ix, cell.root_iy, cell.path[:-1])


def ancestor_1km(cell: Cell) -> Cell:
    if cell.level == "100km2":
        raise ValueError("100 km² root has no 1 km² descendant ancestor")
    return Cell("1km2", cell.root_ix, cell.root_iy, (cell.path[0],))
