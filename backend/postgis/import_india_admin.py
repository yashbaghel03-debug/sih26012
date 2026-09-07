"""Import the Government of India's official India_Boundary state polygons into PostGIS.

The source is the NIC/Bharat map-services India_Boundary service, which is
based on Survey of India topographic data. It is used for the national boundary
clip so the application follows the Government of India's map representation,
including the Jammu & Kashmir / Ladakh extent represented by that source.
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
    "https://mapservice.gov.in/mapserviceserv176/rest/services/India_Boundary/MapServer/0/query",
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
    raise RuntimeError("Official India_Boundary GIS service returned no features")

with psycopg2.connect(DSN) as conn, conn.cursor() as cur:
    cur.execute("DELETE FROM admin_boundaries WHERE source = 'gov.in:India_Boundary' AND level = 'state'")
    for feature in features:
        props = feature.get("properties") or {}
        geom = feature.get("geometry")
        if not geom:
            continue
        name = props.get("STNAME") or props.get("STNAME_SH") or props.get("NAME")
        code = props.get("STCODE11") or props.get("STCODE")
        source_id = str(props.get("OBJECTID", props.get("FID", "")))
        cur.execute(
            """INSERT INTO admin_boundaries(source,source_id,level,name,code,geom,properties)
               VALUES(%s,%s,%s,%s,%s,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)),%s)""",
            ("gov.in:India_Boundary", source_id, "state", name, code, json.dumps(geom), Json(props)),
        )
    cur.execute("CREATE INDEX IF NOT EXISTS admin_boundaries_geom_gix ON admin_boundaries USING GIST (geom)")
    conn.commit()
print(f"Imported {len(features)} official India_Boundary state features into PostGIS")
