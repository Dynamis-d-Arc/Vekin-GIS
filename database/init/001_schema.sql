CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS grids (
  grid_id text PRIMARY KEY,
  geometry geometry(Polygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_grids_geometry
  ON grids
  USING gist (geometry);

CREATE TABLE IF NOT EXISTS satellite_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_date timestamptz NOT NULL,
  satellite text NOT NULL,
  cloud_cover numeric(5, 2),
  bbox geometry(Polygon, 4326) NOT NULL,
  image_url text,
  processing_status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_satellite_images_capture_date
  ON satellite_images (capture_date);

CREATE INDEX IF NOT EXISTS idx_satellite_images_bbox
  ON satellite_images
  USING gist (bbox);

CREATE TABLE IF NOT EXISTS ndvi_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grid_id text NOT NULL REFERENCES grids(grid_id) ON DELETE CASCADE,
  capture_date timestamptz NOT NULL,
  average_ndvi double precision,
  minimum_ndvi double precision,
  maximum_ndvi double precision,
  average_ndbi double precision,
  minimum_ndbi double precision,
  maximum_ndbi double precision,
  geometry geometry(Polygon, 4326) NOT NULL,
  satellite_image_id uuid REFERENCES satellite_images(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grid_id, capture_date, satellite_image_id)
);

CREATE INDEX IF NOT EXISTS idx_ndvi_statistics_grid_id
  ON ndvi_statistics (grid_id);

CREATE INDEX IF NOT EXISTS idx_ndvi_statistics_capture_date
  ON ndvi_statistics (capture_date);

CREATE INDEX IF NOT EXISTS idx_ndvi_statistics_geometry
  ON ndvi_statistics
  USING gist (geometry);

ALTER TABLE ndvi_statistics
  ADD COLUMN IF NOT EXISTS average_ndbi double precision,
  ADD COLUMN IF NOT EXISTS minimum_ndbi double precision,
  ADD COLUMN IF NOT EXISTS maximum_ndbi double precision;
