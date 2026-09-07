# Phase 7 — Spatial Indexing Math

The finest required unit is 0.1 m². A 1 m² square cannot be split into ten identical squares because that would require a side length of sqrt(0.1) m. The implementation therefore uses ten deterministic 0.1 m × 1.0 m rectangles.

Hierarchy: `1km → 100m → 10m → 1m → 0.1m²`.

Each transition has exactly 100 children except the final 1 m → 0.1 m² transition, which has exactly 10 children. IDs use a fixed global origin and integer lattice indices, so a fine cell can always be traced to its 1 km ancestor.
