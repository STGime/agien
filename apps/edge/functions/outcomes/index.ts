import type { EdgeHandler } from "@eurobase/sdk/functions";
import { handleRequest } from "./http.ts";

/** Deployed /v1/outcomes handler. Adapts the Eurobase EdgeContext. */
const handler: EdgeHandler = (req, ctx) => {
  return handleRequest(req, { db: ctx.db, log: ctx.log });
};

export default handler;
