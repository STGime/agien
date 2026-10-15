/**
 * Retention purge: deletes evaluation/outcome/session rows past the approved
 * retention window. Pure and dependency-injected so it unit-tests without the
 * Eurobase runtime or a database.
 *
 * Retention period is a placeholder default pending the Legal retention
 * schedule (issue #14); each table is purged independently and a failure on
 * one table is logged and zeroed rather than crashing the scheduled run.
 */

/** Placeholder pending the Legal retention schedule (#14). */
export const DEFAULT_RETENTION_DAYS = 30;

export interface PurgeDb {
  deleteEvaluationsOlderThan(cutoff: Date): Promise<number>;
  deleteOutcomesOlderThan(cutoff: Date): Promise<number>;
  deleteExpiredSessions(now: Date): Promise<number>;
}

export interface PurgeResult {
  /** ISO-8601 cutoff used for the evaluations/outcomes deletes. */
  cutoff: string;
  evaluations: number;
  outcomes: number;
  sessions: number;
}

export interface PurgeOptions {
  now?: Date;
  retentionDays?: number;
  log?: { error: (msg: string, data?: unknown) => void };
}

export function computeCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

type TableKey = "evaluations" | "outcomes" | "sessions";

export async function purge(db: PurgeDb, opts: PurgeOptions = {}): Promise<PurgeResult> {
  const now = opts.now ?? new Date();
  const retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const cutoff = computeCutoff(now, retentionDays);

  const result: PurgeResult = {
    cutoff: cutoff.toISOString(),
    evaluations: 0,
    outcomes: 0,
    sessions: 0,
  };

  const steps: Array<{ key: TableKey; run: () => Promise<number> }> = [
    { key: "evaluations", run: () => db.deleteEvaluationsOlderThan(cutoff) },
    { key: "outcomes", run: () => db.deleteOutcomesOlderThan(cutoff) },
    { key: "sessions", run: () => db.deleteExpiredSessions(now) },
  ];

  for (const step of steps) {
    try {
      result[step.key] = await step.run();
    } catch (err) {
      opts.log?.error(`purge: ${step.key} failed`, { message: String(err) });
    }
  }

  return result;
}
