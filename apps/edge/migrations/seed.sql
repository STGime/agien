INSERT INTO venues (slug, name) VALUES
  ('ven_test_a', 'Venue Test A'),
  ('ven_test_b', 'Venue Test B')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO api_keys (venue_id, key_hash)
SELECT v.id, public.hash_api_key('sk_test_' || v.slug)
FROM venues v
WHERE v.slug IN ('ven_test_a', 'ven_test_b')
ON CONFLICT (venue_id, key_hash) DO NOTHING;
