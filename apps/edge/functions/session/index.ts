import type { EdgeHandler } from "@eurobase/sdk/functions";
import { handleRequest } from "./http.ts";

/** Deployed /api/session handler. */
const handler: EdgeHandler = (req, ctx) => {
  return handleRequest(req, { db: ctx.db, log: ctx.log });
};

export default handler;
