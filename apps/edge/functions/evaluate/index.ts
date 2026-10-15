import type { EdgeHandler } from "@eurobase/sdk/functions";
import { handleRequest } from "./http.ts";

/**
 * Deployed /v1/evaluate handler. Adapts the Eurobase EdgeContext
 * (ctx.db / ctx.log) to the testable handleRequest pipeline.
 */
const handler: EdgeHandler = (req, ctx) => {
  return handleRequest(req, { db: ctx.db, log: ctx.log });
};

export default handler;
