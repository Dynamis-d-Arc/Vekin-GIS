CREATE EXTENSION IF NOT EXISTS postgis;

WITH bounds AS (
  SELECT ST_MakeEnvelope(100.327, 13.494, 100.938, 13.955, 4326) AS geom
),
grid AS (
  SELECT (ST_SquareGrid(0.02, geom)).*
  FROM bounds
),
numbered AS (
  SELECT
    'BKK-' || lpad(row_number() OVER ()::text, 5, '0') AS grid_id,
    ST_Intersection(grid.geom, bounds.geom)::geometry(Polygon, 4326) AS geometry
  FROM grid
  CROSS JOIN bounds
  WHERE ST_Intersects(grid.geom, bounds.geom)
)
INSERT INTO grids (grid_id, geometry)
SELECT grid_id, geometry
FROM numbered
WHERE NOT ST_IsEmpty(geometry)
ON CONFLICT (grid_id) DO NOTHING;

