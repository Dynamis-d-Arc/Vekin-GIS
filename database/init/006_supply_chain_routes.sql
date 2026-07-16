CREATE TABLE IF NOT EXISTS supply_chain_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supply_chain_routes_updated_at
  ON supply_chain_routes (updated_at DESC);

CREATE TABLE IF NOT EXISTS supply_chain_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES supply_chain_routes(id) ON DELETE CASCADE,
  client_stop_id text,
  stop_order integer NOT NULL,
  stop_type text NOT NULL CHECK (
    stop_type IN ('farm', 'cooperative', 'dpo')
  ),
  name text,
  geometry geometry(Geometry, 4326) NOT NULL CHECK (
    GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON')
  ),
  farm_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, stop_order)
);

CREATE INDEX IF NOT EXISTS idx_supply_chain_route_stops_route_order
  ON supply_chain_route_stops (route_id, stop_order);

CREATE INDEX IF NOT EXISTS idx_supply_chain_route_stops_geometry
  ON supply_chain_route_stops
  USING gist (geometry);

UPDATE supply_chain_route_stops
SET
  stop_type = CASE stop_type
    WHEN 'processor' THEN 'cooperative'
    WHEN 'retailer' THEN 'dpo'
    ELSE stop_type
  END,
  name = CASE
    WHEN stop_type IN ('processor', 'cooperative') AND name = 'Processor' THEN 'Cooperative'
    WHEN stop_type IN ('retailer', 'dpo') AND name = 'Retailer' THEN 'DPO'
    ELSE name
  END,
  updated_at = now()
WHERE stop_type IN ('processor', 'retailer')
   OR (stop_type IN ('cooperative', 'dpo') AND name IN ('Processor', 'Retailer'));
