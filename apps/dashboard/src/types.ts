/** An evaluation row as stored in the `evaluations` table (#4). */
export interface Reason {
  code: string;
  weight: number;
  detail?: string;
}

export type Action = "allow" | "step_up" | "deny";

export interface Evaluation {
  id: string;
  venue_id: string;
  session_token_hash: string | null;
  p_agent: number;
  p_phantom: number;
  action: Action;
  reasons: Reason[];
  policy_version: string;
  latency_ms: number | null;
  created_at: string;
}

export interface Venue {
  id: string;
  slug: string;
  name: string;
  created_at: string;
}
