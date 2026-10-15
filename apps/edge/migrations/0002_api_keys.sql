CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (venue_id, key_hash)
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_venue ON api_keys;
CREATE POLICY api_keys_venue ON api_keys FOR ALL
  USING (public.is_service_role() OR venue_id = public.current_venue_id())
  WITH CHECK (public.is_service_role() OR venue_id = public.current_venue_id());
