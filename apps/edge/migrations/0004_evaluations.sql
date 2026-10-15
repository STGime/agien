CREATE TABLE IF NOT EXISTS evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  session_token_hash text,
  p_agent double precision NOT NULL,
  p_phantom double precision NOT NULL,
  action text NOT NULL CHECK (action IN ('allow', 'step_up', 'deny')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_version text NOT NULL,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evaluations_venue ON evaluations;
CREATE POLICY evaluations_venue ON evaluations FOR ALL
  USING (is_service_role() OR venue_id = current_venue_id())
  WITH CHECK (is_service_role() OR venue_id = current_venue_id());
