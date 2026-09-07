"""Import state boundaries from the Government of India's mapservice into PostGIS.

The service is a real government GIS endpoint; geometry is fetched as GeoJSON and
stored in EPSG:4326. This script intentionally does not invent cadastral parcels.
"""
from __future__ import annotations
import json
import os
import urllib.parse
import urllib.request
import psycopg2
from psycopg2.extras import Json

URL = os.getenv(
    "INDIA_STATE_GIS_URL",
    "https://mapservice.gov.in/gismapservice/rest/services/BharatMapService/Admin_Boundary_District/MapServer/0/query",
)
DSN = os.getenv("POSTGIS_DSN", "dbname=sih26012 user=sih password=sih host=localhost port=5432")

params = urllib.parse.urlencode({
    "where": "1=1",
    "outFields": "*",
    "returnGeometry": "true",
    "outSR": "4326",
    "f": "geojson",
})
with urllib.request.urlopen(URL + "?" + params, timeout=60) as response:
    data = json.load(response)

features = data.get("features", [])
if not features:
    raise RuntimeError("Government GIS service returned no state features")

with psycopg2.connect(DSN) as conn, conn.cursor() as cur:
    cur.execute("DELETE FROM admin_boundaries WHERE source = 'gov.in:BharatMapService' AND level = 'state'")
    for feature in features:
        props = feature.get("properties") or {}
        geom = feature.get("geometry")
        if not geom:
            continue
        name = props.get("STNAME") or props.get("STNAME_SH")
        code = props.get("STCODE11")
        source_id = str(props.get("OBJECTID", ""))
        cur.execute(
            """INSERT INTO admin_boundaries(source,source_id,level,name,code,geom,properties)
               VALUES(%s,%s,%s,%s,%s,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)),%s)""",
            ("gov.in:BharatMapService", source_id, "state", name, code, json.dumps(geom), Json(props)),
        )
    cur.execute("CREATE INDEX IF NOT EXISTS admin_boundaries_geom_gix ON admin_boundaries USING GIST (geom)")
    conn.commit()
print(f"Imported {len(features)} real state/UT features into PostGIS")
