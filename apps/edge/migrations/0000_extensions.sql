CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Service-role predicate. Eurobase ships this function; it is defined here so
-- the same policies run unchanged against a local Postgres.
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(nullif(current_setting('app.service_role', true), ''), '') = 'true'
      OR current_user = 'service';
$$;

-- Current venue id, injected per-request. On Eurobase this is derived from the
-- caller's JWT; the local test harness sets the GUC directly.
CREATE OR REPLACE FUNCTION public.current_venue_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.venue_id', true), '')::uuid;
$$;

-- API keys are stored as a SHA-256 hex digest, never in plaintext.
CREATE OR REPLACE FUNCTION public.hash_api_key(key text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT encode(digest(key, 'sha256'), 'hex');
$$;
