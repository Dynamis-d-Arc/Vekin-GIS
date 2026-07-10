CREATE TABLE IF NOT EXISTS context_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_hash text NOT NULL UNIQUE,
  selected_area geometry(Geometry, 4326) NOT NULL,
  bbox geometry(Polygon, 4326) NOT NULL,
  dem_url text NOT NULL,
  land_cover_url text NOT NULL,
  dem_source text NOT NULL DEFAULT 'cop-dem-glo-30',
  land_cover_source text NOT NULL DEFAULT 'esa-worldcover',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_context_layers_selected_area
  ON context_layers
  USING gist (selected_area);

CREATE INDEX IF NOT EXISTS idx_context_layers_bbox
  ON context_layers
  USING gist (bbox);
