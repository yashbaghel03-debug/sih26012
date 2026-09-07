CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS admin_boundaries (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT,
  level TEXT NOT NULL,
  name TEXT,
  code TEXT,
  geom geometry(MultiPolygon,4326) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS admin_boundaries_geom_gix ON admin_boundaries USING GIST (geom);
CREATE INDEX IF NOT EXISTS admin_boundaries_level_idx ON admin_boundaries(level);

CREATE TABLE IF NOT EXISTS cadastral_parcels (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  parcel_id TEXT,
  state_code TEXT,
  district_code TEXT,
  village_code TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(MultiPolygon,4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS cadastral_parcels_geom_gix ON cadastral_parcels USING GIST (geom);
CREATE UNIQUE INDEX IF NOT EXISTS cadastral_parcels_source_id_idx ON cadastral_parcels(source,parcel_id) WHERE parcel_id IS NOT NULL;

COMMENT ON TABLE admin_boundaries IS 'Real administrative boundaries imported from an authoritative/public GIS source. Source is recorded per feature.';
COMMENT ON TABLE cadastral_parcels IS 'Real cadastral polygons supplied by a state/land-record authority. No synthetic parcel geometry belongs here.';
