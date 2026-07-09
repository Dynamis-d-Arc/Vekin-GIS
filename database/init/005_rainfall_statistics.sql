CREATE TABLE IF NOT EXISTS rainfall_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_hash text NOT NULL UNIQUE,
  geometry geometry(Polygon, 4326) NOT NULL,
  bbox geometry(Polygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rainfall_areas_geometry
  ON rainfall_areas
  USING gist (geometry);

CREATE TABLE IF NOT EXISTS rainfall_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES rainfall_areas(id) ON DELETE CASCADE,
  capture_date date NOT NULL,
  source text NOT NULL DEFAULT 'chirps-daily',
  average_rainfall_mm double precision,
  minimum_rainfall_mm double precision,
  maximum_rainfall_mm double precision,
  median_rainfall_mm double precision,
  rainfall_stddev_mm double precision,
  valid_pixel_count integer NOT NULL DEFAULT 0,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area_id, capture_date, source)
);

CREATE INDEX IF NOT EXISTS idx_rainfall_statistics_area_date
  ON rainfall_statistics (area_id, capture_date);

CREATE INDEX IF NOT EXISTS idx_rainfall_statistics_capture_date
  ON rainfall_statistics (capture_date);

CREATE TABLE IF NOT EXISTS rainfall_grid_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES rainfall_areas(id) ON DELETE CASCADE,
  grid_id text NOT NULL REFERENCES grids(grid_id) ON DELETE CASCADE,
  capture_date date NOT NULL,
  source text NOT NULL DEFAULT 'chirps-daily',
  average_rainfall_mm double precision,
  minimum_rainfall_mm double precision,
  maximum_rainfall_mm double precision,
  median_rainfall_mm double precision,
  rainfall_stddev_mm double precision,
  valid_pixel_count integer NOT NULL DEFAULT 0,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area_id, grid_id, capture_date, source)
);

CREATE INDEX IF NOT EXISTS idx_rainfall_grid_statistics_grid_date
  ON rainfall_grid_statistics (grid_id, capture_date);

CREATE INDEX IF NOT EXISTS idx_rainfall_grid_statistics_area_date
  ON rainfall_grid_statistics (area_id, capture_date);
