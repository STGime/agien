CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venues_venue ON venues;
CREATE POLICY venues_venue ON venues FOR ALL
  USING (public.is_service_role() OR id = public.current_venue_id())
  WITH CHECK (public.is_service_role() OR id = public.current_venue_id());
