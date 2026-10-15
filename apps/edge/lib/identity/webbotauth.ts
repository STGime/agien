import type { IdentityRequest, JwksResolver } from "./types.ts";

export interface WebBotAuthOutcome {
  verified: boolean;
  /** The declared agent (Signature-Agent header), when present. */
  provider: string | null;
  reason_code: string;
}

const MAX_SPAN_SECONDS = 24 * 60 * 60;

interface SignatureParams {
  label: string;
  components: string[];
  created: number | null;
  expires: number | null;
  keyid: string | null;
  tag: string | null;
  /** The verbatim inner-list + parameters (after the `label=`), as received. */
  paramsSerialized: string;
}

function parseSignatureInput(header: string): SignatureParams | null {
  const trimmed = header.trim();
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const label = trimmed.slice(0, eq);
  const rest = trimmed.slice(eq + 1);
  if (!rest.startsWith("(")) return null;
  const close = rest.indexOf(")");
  if (close === -1) return null;

  const listStr = rest.slice(1, close);
  const paramsStr = rest.slice(close + 1);

  const components: string[] = [];
  for (const m of listStr.matchAll(/"([^"]+)"|([^\s"]+)/g)) {
    components.push(m[1] ?? m[2]);
  }

  let created: number | null = null;
  let expires: number | null = null;
  let keyid: string | null = null;
  let tag: string | null = null;

  for (
    const pm of paramsStr.matchAll(/;([a-zA-Z][a-zA-Z0-9_-]*)(?:=("(?:[^"\\]|\\.)*"|[^;]*))?/g)
  ) {
    const name = pm[1];
    let raw = pm[2];
    if (raw === undefined) continue;
    if (raw.startsWith('"')) raw = raw.slice(1, -1).replace(/\\(["\\])/g, "$1");
    switch (name) {
      case "created":
        created = Number(raw);
        break;
      case "expires":
        expires = Number(raw);
        break;
      case "keyid":
        keyid = raw;
        break;
      case "tag":
        tag = raw;
        break;
    }
  }

  return { label, components, created, expires, keyid, tag, paramsSerialized: rest };
}

function parseSignature(header: string, label: string): Uint8Array<ArrayBuffer> | null {
  const trimmed = header.trim();
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  if (trimmed.slice(0, eq) !== label) return null;
  let rest = trimmed.slice(eq + 1).trim();
  if (rest.startsWith(":") && rest.endsWith(":")) rest = rest.slice(1, -1);
  try {
    const bin = atob(rest);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function canonicalizeComponent(
  component: string,
  req: IdentityRequest,
  sigAgent: string,
): string | null {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return null;
  }
  switch (component) {
    case "@method":
      return req.method.toLowerCase();
    case "@authority":
      return url.host.toLowerCase();
    case "@path":
      return url.pathname + url.search;
    case "signature-agent":
      return sigAgent;
    default:
      return null;
  }
}

function buildSignatureBase(
  params: SignatureParams,
  req: IdentityRequest,
  sigAgent: string,
): string | null {
  const lines: string[] = [];
  for (const c of params.components) {
    const value = canonicalizeComponent(c, req, sigAgent);
    if (value === null) return null;
    lines.push(`"${c}": ${value}`);
  }
  lines.push(`"@signature-params": ${params.paramsSerialized}`);
  return lines.join("\n") + "\n";
}

function header(req: IdentityRequest, name: string): string | undefined {
  return req.headers[name.toLowerCase()];
}

/**
 * Verify a Web Bot Auth (RFC 9421) Ed25519 signature over the request's
 * @authority, @method, @path and signature-agent components. Key material is
 * resolved via the injected `resolveJwks` (the caller owns any cache).
 */
export async function verifyWebBotAuth(
  req: IdentityRequest,
  resolveJwks: JwksResolver,
): Promise<WebBotAuthOutcome> {
  const sigInput = header(req, "signature-input");
  const sigAgent = (header(req, "signature-agent") ?? "").trim();
  const fail = (reason: string): WebBotAuthOutcome => ({
    verified: false,
    provider: sigAgent || null,
    reason_code: reason,
  });

  const params = sigInput ? parseSignatureInput(sigInput) : null;
  if (!params) return fail("web_bot_auth_invalid");

  if (params.tag !== "web-bot-auth") return fail("web_bot_auth_invalid");

  if (params.created !== null && params.expires !== null) {
    if (params.expires - params.created > MAX_SPAN_SECONDS) return fail("web_bot_auth_invalid");
  }

  if (params.expires !== null && params.expires <= Math.floor(Date.now() / 1000)) {
    return fail("web_bot_auth_expired");
  }

  if (!params.keyid) return fail("web_bot_auth_invalid");

  const jwk = await resolveJwks(params.keyid);
  if (!jwk) return fail("web_bot_auth_invalid");

  const base = buildSignatureBase(params, req, sigAgent);
  if (base === null) return fail("web_bot_auth_invalid");

  const signature = header(req, "signature")
    ? parseSignature(header(req, "signature")!, params.label)
    : null;
  if (!signature) return fail("web_bot_auth_invalid");

  let ok = false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]);
    ok = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      signature,
      new Uint8Array(new TextEncoder().encode(base)),
    );
  } catch {
    ok = false;
  }

  if (!ok) return fail("web_bot_auth_invalid");
  return { verified: true, provider: sigAgent || null, reason_code: "web_bot_auth_verified" };
}
