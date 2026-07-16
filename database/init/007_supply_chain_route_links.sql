CREATE TABLE IF NOT EXISTS supply_chain_route_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES supply_chain_routes(id) ON DELETE CASCADE,
  from_stop_id uuid NOT NULL REFERENCES supply_chain_route_stops(id) ON DELETE CASCADE,
  to_stop_id uuid NOT NULL REFERENCES supply_chain_route_stops(id) ON DELETE CASCADE,
  link_order integer NOT NULL,
  link_type text NOT NULL DEFAULT 'custom' CHECK (
    link_type IN ('inbound', 'outbound', 'chain', 'custom')
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_stop_id <> to_stop_id),
  UNIQUE (route_id, link_order)
);

CREATE INDEX IF NOT EXISTS idx_supply_chain_route_links_route_order
  ON supply_chain_route_links (route_id, link_order);

CREATE INDEX IF NOT EXISTS idx_supply_chain_route_links_from_stop
  ON supply_chain_route_links (from_stop_id);

CREATE INDEX IF NOT EXISTS idx_supply_chain_route_links_to_stop
  ON supply_chain_route_links (to_stop_id);
