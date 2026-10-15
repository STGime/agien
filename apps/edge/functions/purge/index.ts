import type { EdgeHandler } from "@eurobase/sdk/functions";
import { purge, type PurgeDb } from "./mod.ts";

/**
 * Scheduled retention-purge handler. Wires the Eurobase `ctx.db.sql` surface to
 * the pure `purge` core and returns the audit result. Register it as a cron
 * schedule once deployed, e.g. via the SDK:
 *
 *   await eb.functions.schedules.createOrUpdate("purge", {
 *     functionName: "purge",
 *     cron: "0 4 * * *",   // daily 04:00 UTC
 *     timezone: "UTC",
 *   })
 */
const handler: EdgeHandler = async (_req, ctx) => {
  const db: PurgeDb = {
    deleteEvaluationsOlderThan: async (cutoff) => {
      const rows = await ctx.db.sql(
        "DELETE FROM evaluations WHERE created_at < $1 RETURNING id",
        [cutoff.toISOString()],
      );
      return rows.length;
    },
    deleteOutcomesOlderThan: async (cutoff) => {
      const rows = await ctx.db.sql(
        "DELETE FROM outcomes WHERE reported_at < $1 RETURNING id",
        [cutoff.toISOString()],
      );
      return rows.length;
    },
    deleteExpiredSessions: async (now) => {
      const rows = await ctx.db.sql(
        "DELETE FROM sessions WHERE expires_at < $1 RETURNING id",
        [now.toISOString()],
      );
      return rows.length;
    },
  };

  const result = await purge(db, { log: ctx.log });
  return Response.json(result, { status: 200 });
};

export default handler;
