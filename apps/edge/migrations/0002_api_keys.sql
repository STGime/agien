CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (venue_id, key_hash)
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_venue ON api_keys;
CREATE POLICY api_keys_venue ON api_keys FOR ALL
  USING (is_service_role() OR venue_id = current_venue_id())
  WITH CHECK (is_service_role() OR venue_id = current_venue_id());
