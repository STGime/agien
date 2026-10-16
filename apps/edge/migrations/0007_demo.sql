-- Demo booking site (issue #6): slots + bookings for the corpus/e2e fixture.
-- A single demo venue (ven_demo) holds a rolling 14-day slot grid.

CREATE TABLE IF NOT EXISTS demo_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  slot_date date NOT NULL,
  start_time time NOT NULL,
  party_size_max integer NOT NULL DEFAULT 6,
  is_hot boolean NOT NULL DEFAULT false,
  hot_release_minute integer,   -- minute-of-day when a hot slot opens (null unless is_hot)
  sold_out boolean NOT NULL DEFAULT false,
  UNIQUE (venue_id, slot_date, start_time)
);

CREATE TABLE IF NOT EXISTS demo_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL UNIQUE REFERENCES demo_slots(id),
  venue_id uuid NOT NULL REFERENCES venues(id),
  session_token_hash text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  notes text,
  party_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE demo_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_slots_venue ON demo_slots;
CREATE POLICY demo_slots_venue ON demo_slots FOR ALL
  USING (is_service_role() OR venue_id = current_venue_id())
  WITH CHECK (is_service_role() OR venue_id = current_venue_id());

ALTER TABLE demo_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_bookings_venue ON demo_bookings;
CREATE POLICY demo_bookings_venue ON demo_bookings FOR ALL
  USING (is_service_role() OR venue_id = current_venue_id())
  WITH CHECK (is_service_role() OR venue_id = current_venue_id());

-- Seed the demo venue and a deterministic 14-day slot grid.
INSERT INTO venues (slug, name) VALUES ('ven_demo', 'Demo Restaurant')
ON CONFLICT (slug) DO NOTHING;

-- 4 slots per day for the next 14 days (rolling, idempotent):
--   12:00 normal, 17:00 normal, 19:00 hot (opens at 11:00), 21:00 sold out.
INSERT INTO demo_slots (venue_id, slot_date, start_time, is_hot, hot_release_minute, sold_out)
SELECT v.id, (current_date + g), t.start_time, t.is_hot, t.hot_release_minute, t.sold_out
FROM venues v
CROSS JOIN generate_series(0, 13) AS g
CROSS JOIN (VALUES
  ('12:00'::time, false, NULL::integer, false),
  ('17:00'::time, false, NULL::integer, false),
  ('19:00'::time, true,  660,          false),
  ('21:00'::time, false, NULL::integer, true)
) AS t(start_time, is_hot, hot_release_minute, sold_out)
WHERE v.slug = 'ven_demo'
ON CONFLICT (venue_id, slot_date, start_time) DO NOTHING;
