import { useEffect, useState } from "react";
import type { Venue } from "../types";
import { getEurobaseClient } from "../lib/eurobase";

export interface UseVenuesResult {
  venues: Venue[];
  loading: boolean;
  error: string | null;
}

/**
 * List the venues the signed-in user can see. Sprint 0: there is no
 * user→venue membership table yet (see #9 note), so this lists every venue
 * the RLS policy permits. For the seeded pilot data that is ven_test_a and
 * ven_test_b.
 */
export function useVenues(enabled: boolean): UseVenuesResult {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setVenues([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const result = await getEurobaseClient().db
        .from<Venue>("venues")
        .select("id", "slug", "name", "created_at")
        .order("name");
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setVenues([]);
      } else {
        setVenues(Array.isArray(result.data) ? (result.data as Venue[]) : []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { venues, loading, error };
}
