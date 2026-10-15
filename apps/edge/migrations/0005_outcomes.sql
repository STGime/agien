CREATE TABLE IF NOT EXISTS outcomes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  evaluation_id uuid NOT NULL REFERENCES evaluations(id),
  venue_id uuid NOT NULL REFERENCES venues(id),
  status text NOT NULL CHECK (status IN ('seated', 'no_show', 'cancelled', 'forfeited')),
  reported_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outcomes_venue ON outcomes;
CREATE POLICY outcomes_venue ON outcomes FOR ALL
  USING (public.is_service_role() OR venue_id = public.current_venue_id())
  WITH CHECK (public.is_service_role() OR venue_id = public.current_venue_id());
