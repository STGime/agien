CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_venue ON sessions;
CREATE POLICY sessions_venue ON sessions FOR ALL
  USING (is_service_role() OR venue_id = current_venue_id())
  WITH CHECK (is_service_role() OR venue_id = current_venue_id());
