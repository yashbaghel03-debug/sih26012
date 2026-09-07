"""Hierarchical ALU spatial indexing.

Rules implemented:
- Round areas: 1 km² -> 0.01 km² -> 0.0001 km² -> 0.000001 km² -> 0.1 m².
- The first four transitions divide area by 100 (10 x 10 children).
- The final transition divides 1 m² into ten equal-area square logical units;
  side = sqrt(0.1) metres. Ten congruent squares cannot tile a 1 m² square
  without overlap/gaps, so these final units are defined as deterministic
  equal-area sample footprints inside the parent rather than a gapless tiling.
- Root ALU is a 6-character opaque-looking base36 code containing at least
  one alphabetic and one numeric character.
- Each refinement appends exactly one 2-character base36 token after '-'.
  Every token itself contains at least one alphabetic and one numeric char.
- Codes never expose the spatial level name. Hyphens are the hierarchy.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from typing import Iterator

BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
DIGITS = "0123456789"

# Each tuple is (public level name, side metres, child count, child layout).
LEVEL_SPECS = {
    "1km2": (1000.0, 100, "10x10"),
    "0.01km2": (100.0, 100, "10x10"),
    "0.0001km2": (10.0, 100, "10x10"),
    "0.000001km2": (1.0, 10, "final10"),
    "0.1m2": (sqrt(0.1), 0, "final10"),
}
LEVEL_ORDER = tuple(LEVEL_SPECS)
_PARENT_LEVEL = {
    "0.01km2": "1km2",
    "0.0001km2": "0.01km2",
    "0.000001km2": "0.0001km2",
    "0.1m2": "0.000001km2",
}

# India-wide working extent in EPSG:3857. This is only for deterministic root
# indexing; the actual India polygon still comes from PostGIS.
ROOT_ORIGIN_X = 7_570_000.0
ROOT_ORIGIN_Y = 700_000.0
ROOT_COLS = 4_000


def _b36(n: int, width: int) -> str:
    if n < 0:
        raise ValueError("base36 input must be non-negative")
    chars = []
    while n:
        n, r = divmod(n, 36)
        chars.append(BASE36[r])
    return ("0" * (width - len(chars)) + "".join(reversed(chars))) if chars else "0" * width


def _from_b36(value: str) -> int:
    if not value:
        raise ValueError("empty base36 value")
    n = 0
    for ch in value.upper():
        try:
            digit = BASE36.index(ch)
        except ValueError as exc:
            raise ValueError(f"invalid base36 character: {ch}") from exc
        n = n * 36 + digit
    return n

# 1296 possible 2-char tokens; select the first 100 mixed tokens in base36
# order. Every token contains both a letter and a digit.
CHILD_TOKENS = tuple(
    f"{a}{b}"
    for a in BASE36
    for b in BASE36
    if (a.isalpha() and b.isdigit()) or (a.isdigit() and b.isalpha())
)[:100]
TOKEN_TO_INDEX = {token: i for i, token in enumerate(CHILD_TOKENS)}


def _validate_level(level: str) -> None:
    if level not in LEVEL_SPECS:
        raise ValueError(f"Unknown ALU level: {level}")


def root_indices_to_code(ix: int, iy: int) -> str:
    """Encode a root 1 km index to a 6-character mixed base36 code."""
    if ix < 0 or iy < 0 or ix >= ROOT_COLS:
        raise ValueError("root index outside configured India index extent")
    flat = iy * ROOT_COLS + ix
    # 5 base36 chars carry the flattened root index. The first two chars are
    # constrained to letter + digit so the six-character code always satisfies
    # the mixed alpha-numeric rule, while the remaining four chars use all 36.
    prefix_bucket, remainder = divmod(flat, 36**4)
    if prefix_bucket >= 260:
        raise ValueError("root index exceeds ALU root code capacity")
    p_letter, p_digit = divmod(prefix_bucket, 10)
    return f"{ALPHABET[p_letter]}{DIGITS[p_digit]}{_b36(remainder, 4)}"


def code_to_root_indices(code: str) -> tuple[int, int]:
    code = code.upper()
    if len(code) != 6 or not code[0].isalpha() or not code[1].isdigit():
        raise ValueError("root ALU code must be six characters with letter+number")
    if any(ch not in BASE36 for ch in code):
        raise ValueError("root ALU code must be base36")
    prefix_bucket = ALPHABET.index(code[0]) * 10 + DIGITS.index(code[1])
    flat = prefix_bucket * 36**4 + _from_b36(code[2:])
    return flat % ROOT_COLS, flat // ROOT_COLS


def child_token(index: int) -> str:
    if index < 0 or index >= len(CHILD_TOKENS):
        raise ValueError("child index out of range")
    return CHILD_TOKENS[index]


def child_index(token: str) -> int:
    try:
        return TOKEN_TO_INDEX[token.upper()]
    except KeyError as exc:
        raise ValueError(f"invalid ALU hierarchy token: {token}") from exc


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
        for item in self.path:
            if item < 0 or item >= 100:
                raise ValueError("hierarchy index out of range")
        if self.level == "0.1m2" and self.path[-1] >= 10:
            raise ValueError("final level has only ten child units")

    @property
    def id(self) -> str:
        root = root_indices_to_code(self.root_ix, self.root_iy)
        return "-".join((root, *(child_token(i) for i in self.path)))

    @property
    def width_m(self) -> float:
        return LEVEL_SPECS[self.level][0]

    @property
    def height_m(self) -> float:
        return self.width_m

    @property
    def area_m2(self) -> float:
        return self.width_m * self.height_m

    @property
    def root_flat_index(self) -> int:
        return self.root_iy * ROOT_COLS + self.root_ix

    @property
    def local_1km_offset(self) -> tuple[float, float]:
        ox = oy = 0.0
        side = 1000.0
        for depth, index in enumerate(self.path):
            if depth == 3:  # final ten equal-area squares: logical sample footprints
                break
            size = side / 10.0
            dx = index % 10
            dy = index // 10
            ox += dx * size
            oy += dy * size
            side = size
        return ox, oy

    @property
    def mercator_bounds(self) -> tuple[float, float, float, float]:
        root_x = ROOT_ORIGIN_X + self.root_ix * 1000.0
        root_y = ROOT_ORIGIN_Y + self.root_iy * 1000.0
        if self.level != "0.1m2":
            ox, oy = self.local_1km_offset
            side = self.width_m
            return root_x + ox, root_y + oy, root_x + ox + side, root_y + oy + side

        parent_path = self.path[:-1]
        parent = Cell("0.000001km2", self.root_ix, self.root_iy, parent_path)
        px1, py1, px2, py2 = parent.mercator_bounds
        side = sqrt(0.1)
        # Deterministic 10-sample arrangement. The final units are equal-area
        # squares used as the terminal refinement footprints.
        placements = (
            (0.0, 0.0), (0.3, 0.0), (0.6, 0.0),
            (0.0, 0.3), (0.3, 0.3), (0.6, 0.3),
            (0.0, 0.6), (0.3, 0.6), (0.6, 0.6),
            (0.35, 0.35),
        )
        px, py = placements[self.path[-1]]
        return px1 + px, py1 + py, px1 + px + side, py1 + py + side


def cell_from_id(value: str) -> Cell:
    parts = value.strip().upper().split("-")
    if not parts or len(parts[0]) != 6:
        raise ValueError("Invalid hierarchical ALU code")
    root_ix, root_iy = code_to_root_indices(parts[0])
    depth = len(parts) - 1
    if depth < 0 or depth >= len(LEVEL_ORDER):
        raise ValueError("Invalid ALU hierarchy depth")
    level = LEVEL_ORDER[depth]
    path = tuple(child_index(token) for token in parts[1:])
    if level == "0.1m2" and (not path or path[-1] >= 10):
        raise ValueError("Invalid final ALU child")
    return Cell(level, root_ix, root_iy, path)


def children(cell: Cell) -> Iterator[Cell]:
    next_index = LEVEL_ORDER.index(cell.level) + 1
    if next_index >= len(LEVEL_ORDER):
        return
    next_level = LEVEL_ORDER[next_index]
    count = LEVEL_SPECS[cell.level][1] // (LEVEL_SPECS[next_level][0] ** 2) if next_level != "0.1m2" else 10
    for i in range(int(count)):
        yield Cell(next_level, cell.root_ix, cell.root_iy, cell.path + (i,))


def parent(cell: Cell) -> Cell | None:
    if not cell.path:
        return None
    return Cell(LEVEL_ORDER[LEVEL_ORDER.index(cell.level) - 1], cell.root_ix, cell.root_iy, cell.path[:-1])


def ancestor_1km(cell: Cell) -> Cell:
    return Cell("1km2", cell.root_ix, cell.root_iy, ())
