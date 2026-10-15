CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venues_venue ON venues;
CREATE POLICY venues_venue ON venues FOR ALL
  USING (is_service_role() OR id = current_venue_id())
  WITH CHECK (is_service_role() OR id = current_venue_id());
