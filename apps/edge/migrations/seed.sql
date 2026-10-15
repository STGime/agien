INSERT INTO venues (slug, name) VALUES
  ('ven_test_a', 'Venue Test A'),
  ('ven_test_b', 'Venue Test B')
ON CONFLICT (slug) DO NOTHING;

-- API keys are stored as SHA-256 hex digests, never in plaintext. These are
-- the digests of 'sk_test_ven_test_a' and 'sk_test_ven_test_b'.
INSERT INTO api_keys (venue_id, key_hash)
SELECT v.id, CASE v.slug
  WHEN 'ven_test_a' THEN 'fce8e421a20788ed1bd279106c7e0bd0da199ae739d71bdae8d2c8ac075dc6c3'
  WHEN 'ven_test_b' THEN '57d2fb19f3f0d69c0dcc468b0736f598ab027b0a2fc9f51a6bb57c2945562676'
END
FROM venues v
WHERE v.slug IN ('ven_test_a', 'ven_test_b')
ON CONFLICT (venue_id, key_hash) DO NOTHING;
