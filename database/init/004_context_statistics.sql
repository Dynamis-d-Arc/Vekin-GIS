DO $$
DECLARE
  stats_schema text;
BEGIN
  SELECT table_schema
  INTO stats_schema
  FROM information_schema.tables
  WHERE upper(table_name) = upper('BKK_TMD_WEATHER_DATA')
    AND table_schema NOT IN ('information_schema', 'pg_catalog')
  ORDER BY (table_schema = 'public') DESC, table_schema
  LIMIT 1;

  stats_schema := COALESCE(stats_schema, 'public');

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', stats_schema);

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.dem_statistics (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      grid_id text NOT NULL REFERENCES public.grids(grid_id) ON DELETE CASCADE,
      context_layer_id uuid NOT NULL REFERENCES public.context_layers(id) ON DELETE CASCADE,
      average_elevation double precision,
      minimum_elevation double precision,
      maximum_elevation double precision,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (grid_id, context_layer_id)
    )',
    stats_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I.dem_statistics (grid_id)',
    'idx_dem_statistics_grid_id',
    stats_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I.dem_statistics (context_layer_id)',
    'idx_dem_statistics_context_layer_id',
    stats_schema
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.land_cover_statistics (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      grid_id text NOT NULL REFERENCES public.grids(grid_id) ON DELETE CASCADE,
      context_layer_id uuid NOT NULL REFERENCES public.context_layers(id) ON DELETE CASCADE,
      land_cover_year integer NOT NULL DEFAULT 0,
      dominant_class integer,
      class_percentages jsonb NOT NULL DEFAULT ''{}''::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (grid_id, context_layer_id, land_cover_year)
    )',
    stats_schema
  );

  EXECUTE format(
    'ALTER TABLE %I.land_cover_statistics ADD COLUMN IF NOT EXISTS land_cover_year integer',
    stats_schema
  );

  EXECUTE format(
    'UPDATE %I.land_cover_statistics SET land_cover_year = 0 WHERE land_cover_year IS NULL',
    stats_schema
  );

  EXECUTE format(
    'ALTER TABLE %I.land_cover_statistics ALTER COLUMN land_cover_year SET DEFAULT 0',
    stats_schema
  );

  EXECUTE format(
    'ALTER TABLE %I.land_cover_statistics ALTER COLUMN land_cover_year SET NOT NULL',
    stats_schema
  );

  EXECUTE format(
    'ALTER TABLE %I.land_cover_statistics DROP CONSTRAINT IF EXISTS land_cover_statistics_grid_id_context_layer_id_key',
    stats_schema
  );

  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I.land_cover_statistics (grid_id, context_layer_id, land_cover_year)',
    'idx_land_cover_statistics_grid_context_year',
    stats_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I.land_cover_statistics (grid_id)',
    'idx_land_cover_statistics_grid_id',
    stats_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I.land_cover_statistics (context_layer_id)',
    'idx_land_cover_statistics_context_layer_id',
    stats_schema
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.urban_context_statistics (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      grid_id text NOT NULL REFERENCES public.grids(grid_id) ON DELETE CASCADE,
      context_layer_id uuid NOT NULL REFERENCES public.context_layers(id) ON DELETE CASCADE,
      population_count double precision,
      built_up_area_square_meters double precision,
      green_cover_percentage double precision,
      road_density_km_per_square_km double precision,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (grid_id, context_layer_id)
    )',
    stats_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I.urban_context_statistics (grid_id)',
    'idx_urban_context_statistics_grid_id',
    stats_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I.urban_context_statistics (context_layer_id)',
    'idx_urban_context_statistics_context_layer_id',
    stats_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I.land_cover_statistics (grid_id, land_cover_year)',
    'idx_land_cover_statistics_grid_year',
    stats_schema
  );

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.population_statistics (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      grid_id text NOT NULL REFERENCES public.grids(grid_id) ON DELETE CASCADE,
      context_layer_id uuid NOT NULL REFERENCES public.context_layers(id) ON DELETE CASCADE,
      population_year integer NOT NULL,
      population_count double precision,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (grid_id, context_layer_id, population_year)
    )',
    stats_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I.population_statistics (grid_id, population_year)',
    'idx_population_statistics_grid_year',
    stats_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I.population_statistics (context_layer_id)',
    'idx_population_statistics_context_layer_id',
    stats_schema
  );
END $$;
