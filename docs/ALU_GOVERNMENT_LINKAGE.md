# ALU ↔ Government Linkage

The integration chain is deterministic:

```text
Government-source record
    ↓
Government parcel identifier (ULPIN / Survey / CTS where available)
    ↓
Canonical parcel row
    ↓
Authorized parcel geometry in PostGIS
    ↓
Deterministic representative-point / spatial mapping
    ↓
Existing ALU lattice
```

`backend/spatial_indexing/lattice.py` remains the only ALU hierarchy implementation. Its hierarchy is 100 km² → 1 km² → 0.01 km² → 0.0001 km² → 1 m² → logical 0.1 m² terminal indexing. The Pune integration does not create a second ALU algorithm.

The current Pune seed has no authorized cadastral geometry and therefore has **no ALU assignment**. The API deliberately reports `N/D` instead of inventing a parcel location.

When geometry is supplied through the documented geometry ingestion route, the service:

1. validates Polygon/MultiPolygon geometry;
2. stores it in `canonical_parcels.geometry` with SRID 4326;
3. transforms the representative point to EPSG:3857;
4. determines the deterministic ALU cell using the existing lattice origin and subdivision rules;
5. stores `parcel_alu_link` with relationship type, intersection area/percentage, geometry source, assignment method and confidence.

### Identifier distinction

- **ULPIN**: government parcel identifier when provided/verified.
- **Survey/Gat/CTS**: source-system land identifiers.
- **ALU**: project deterministic spatial index; it is **not** a government identifier.
