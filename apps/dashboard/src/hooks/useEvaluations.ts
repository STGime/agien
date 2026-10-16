import { useCallback, useEffect, useRef, useState } from "react";
import type { Evaluation } from "../types";
import { getEurobaseClient } from "../lib/eurobase";

const MAX_ROWS = 200;

export interface UseEvaluationsResult {
  evaluations: Evaluation[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetch the last `MAX_ROWS` evaluations for a venue, then keep the list
 * live via a Realtime subscription. The SDK's realtime `on()` has no
 * server-side row filter, so incoming events are filtered client-side by
 * `venue_id` (see #9: server-side filter is an SDK gap).
 */
export function useEvaluations(venueId: string | null): UseEvaluationsResult {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const venueRef = useRef(venueId);
  venueRef.current = venueId;

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    const client = getEurobaseClient();
    const result = await client.db
      .from<Evaluation>("evaluations")
      .select("id", "created_at", "p_agent", "p_phantom", "action", "reasons", "policy_version")
      .eq("venue_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (result.error) {
      setError(result.error);
      setEvaluations([]);
    } else {
      setEvaluations(Array.isArray(result.data) ? (result.data as Evaluation[]) : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!venueId) {
      setEvaluations([]);
      return;
    }
    void load(venueId);

    const client = getEurobaseClient();
    const sub = client.realtime.on("evaluations", "INSERT", (event) => {
      const record = event.record as Evaluation;
      // client-side venue filter (server-side row filter is an SDK gap)
      if (record?.venue_id !== venueRef.current) return;
      setEvaluations((prev) => {
        if (prev.some((e) => e.id === record.id)) return prev;
        return [record, ...prev].slice(0, MAX_ROWS);
      });
    });

    return () => {
      client.realtime.off(sub);
    };
  }, [venueId, load]);

  return { evaluations, loading, error };
}
