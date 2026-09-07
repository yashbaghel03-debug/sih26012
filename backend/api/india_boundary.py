"""Strict national India boundary helpers for WebGIS clipping."""
from __future__ import annotations

import psycopg2


def dissolved_india_geojson(dsn: str):
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("""SELECT ST_AsGeoJSON(ST_UnaryUnion(ST_Collect(geom)))::json
                       FROM admin_boundaries
                       WHERE level='state'""")
        row = cur.fetchone()
    return row[0] if row else None
