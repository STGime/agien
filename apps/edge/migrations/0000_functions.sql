-- Helper functions shared by the RLS policies.
--
-- On Eurobase the platform ships is_service_role() (the secret key and edge
-- functions bypass the row filter through it); it is defined here only so the
-- same policies run unchanged against a local Postgres, which lacks it.
-- No extensions are required: gen_random_uuid() is core in PostgreSQL 13+.

CREATE OR REPLACE FUNCTION is_service_role()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(nullif(current_setting('app.service_role', true), ''), '') = 'true'
      OR current_user = 'service';
$$;

-- Current venue id, injected per-request. The local test harness sets the GUC
-- directly; wiring it to the caller's JWT claim on Eurobase is a follow-up.
CREATE OR REPLACE FUNCTION current_venue_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.venue_id', true), '')::uuid;
$$;
