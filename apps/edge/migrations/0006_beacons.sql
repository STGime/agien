CREATE TABLE IF NOT EXISTS beacons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id),
  feature_vector jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE beacons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS beacons_venue ON beacons;
CREATE POLICY beacons_venue ON beacons FOR ALL
  USING (is_service_role() OR venue_id = current_venue_id())
  WITH CHECK (is_service_role() OR venue_id = current_venue_id());
