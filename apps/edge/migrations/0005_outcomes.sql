CREATE TABLE IF NOT EXISTS outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES evaluations(id),
  venue_id uuid NOT NULL REFERENCES venues(id),
  status text NOT NULL CHECK (status IN ('seated', 'no_show', 'cancelled', 'forfeited')),
  reported_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outcomes_venue ON outcomes;
CREATE POLICY outcomes_venue ON outcomes FOR ALL
  USING (is_service_role() OR venue_id = current_venue_id())
  WITH CHECK (is_service_role() OR venue_id = current_venue_id());
