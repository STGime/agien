/**
 * Local demo server (make demo-up). Serves apps/demo-site static files and
 * proxies /api/* to the deployed newtek edge functions, injecting the Eurobase
 * project key (apikey header) server-side so it never reaches the browser.
 *
 *   deno run --allow-net --allow-read --allow-env server.ts
 */

const PORT = Number(Deno.env.get("DEMO_PORT") ?? 8000);
const SITE_DIR = new URL(".", import.meta.url);
const FUNCTION_BASE = "https://newtek.eurobase.app/v1/functions";
const API_KEY = Deno.env.get("EUROBASE_API_KEY") ?? "";

const ROUTES: Record<string, string> = {
  "/api/session": `${FUNCTION_BASE}/session`,
  "/api/slots": `${FUNCTION_BASE}/slots`,
  "/api/book": `${FUNCTION_BASE}/book`,
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function routeFor(url: URL): string | null {
  for (const [prefix, target] of Object.entries(ROUTES)) {
    if (url.pathname === prefix) return target;
  }
  return null;
}

async function handleApi(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target = routeFor(url);
  if (!target) return new Response("not found", { status: 404 });

  const headers: Record<string, string> = { apikey: API_KEY };
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  const body = req.method === "GET" || req.method === "HEAD"
    ? undefined
    : await req.text();
  const upstream = await fetch(target + url.search, {
    method: req.method,
    headers,
    body,
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ??
        "application/json",
    },
  });
}

function handleStatic(url: URL): Response {
  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  // prevent path traversal
  const rel = path.replace(/^\/+/, "");
  if (rel.includes("..")) return new Response("forbidden", { status: 403 });

  const fileUrl = new URL(rel, SITE_DIR);
  try {
    const data = Deno.readFileSync(fileUrl);
    const ext = rel.slice(rel.lastIndexOf("."));
    return new Response(data, {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

Deno.serve({ port: PORT }, (req) => {
  const url = new URL(req.url);
  if (routeFor(url)) return handleApi(req);
  return handleStatic(url);
});
