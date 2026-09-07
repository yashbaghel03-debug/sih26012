# Hierarchical ALU Spatial Indexing

The spatial hierarchy follows the computation model used by the WebGIS rounds:

`1 km² → 0.01 km² → 0.0001 km² → 0.000001 km² (1 m²) → 0.1 m²`

The first three refinements divide area by 100, so every parent produces 100 deterministic child squares arranged 10 × 10. The final 1 m² → 0.1 m² step uses a square side of `sqrt(0.1) = 0.316227766... m`.

Ten congruent 0.1 m² squares cannot form a gapless tessellation of a 1 m² square. Therefore the final ten units are deterministic equal-area terminal footprints inside the 1 m² parent, suitable for the terminal Riemann-style refinement step.

## ALU identifier rules

- Root code: exactly 6 alphanumeric characters.
- Root code contains at least one alphabetic character and at least one number.
- Characters come from base36: `0-9` and `A-Z`.
- A hyphen separates each hierarchy level.
- Every hierarchy segment is exactly 2 base36 characters and contains at least one letter and one number.
- The ALU code does not contain strings such as `ALU-1km` or a level name. The hierarchy is represented only by the hyphens.
- Example shape: `A3QVPL-0A-0B-1C-2D`.

The first six characters identify the deterministic 1 km root. Each subsequent two-character token identifies the child position inside its parent. Because the mapping is deterministic, the full ALU code can be parsed back to its spatial ancestor chain without storing the level name in the code.
