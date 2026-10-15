// Shared test helpers: generate an Ed25519 keypair, compute the RFC 7638
// thumbprint used as the keyid, and sign Web Bot Auth fixtures.
import type { IdentityRequest, IpListStore, JwksResolver } from "./types.ts";

export interface Keypair {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  keyid: string;
}

export async function generateKeypair(): Promise<Keypair> {
  const pair = (await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const keyid = await jwkThumbprint(publicJwk);
  return { publicJwk, privateJwk, keyid };
}

export async function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  const members: Record<string, unknown> = { crv: jwk.crv, kty: jwk.kty, x: jwk.x };
  const canonical = JSON.stringify(members, Object.keys(members).sort());
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export interface SignOptions {
  authority?: string;
  method?: string;
  path?: string;
  signatureAgent?: string;
  created?: number;
  expires?: number;
  tag?: string;
  components?: string[];
}

/**
 * Build a request carrying a valid Web Bot Auth signature. `path` (and the
 * other overrides) control what the signature *covers*, independent of `url`,
 * so a test can sign over `/foo` while presenting a request at `/bar` to
 * simulate tampering.
 */
export async function signedRequest(
  kp: Keypair,
  url: string,
  opts: SignOptions = {},
): Promise<IdentityRequest> {
  const parsed = new URL(url);
  const authority = opts.authority ?? parsed.host;
  const method = opts.method ?? "POST";
  const path = opts.path ?? parsed.pathname + parsed.search;
  const signatureAgent = opts.signatureAgent ?? "chatgpt.com";
  const components = opts.components ?? ["@authority", "@method", "@path", "signature-agent"];

  let params = `(${components.join(" ")})`;
  if (opts.created !== undefined) params += `;created=${opts.created}`;
  if (opts.expires !== undefined) params += `;expires=${opts.expires}`;
  params += `;keyid="${kp.keyid}"`;
  if (opts.tag !== undefined) params += `;tag="${opts.tag}"`;

  const lines: string[] = [];
  for (const c of components) {
    lines.push(`"${c}": ${componentValue(c, { authority, method, path, signatureAgent })}`);
  }
  lines.push(`"@signature-params": ${params}`);
  const base = lines.join("\n") + "\n";

  const key = await crypto.subtle.importKey("jwk", kp.privateJwk, { name: "Ed25519" }, false, [
    "sign",
  ]);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "Ed25519" },
      key,
      new Uint8Array(new TextEncoder().encode(base)),
    ),
  );

  return {
    method,
    url,
    ip: "203.0.113.9",
    userAgent: "",
    headers: {
      "signature-input": `sig1=${params}`,
      signature: `sig1=:${base64(sig)}:`,
      "signature-agent": signatureAgent,
    },
  };
}

function componentValue(
  c: string,
  v: { authority: string; method: string; path: string; signatureAgent: string },
): string {
  switch (c) {
    case "@method":
      return v.method.toLowerCase();
    case "@authority":
      return v.authority.toLowerCase();
    case "@path":
      return v.path;
    case "signature-agent":
      return v.signatureAgent;
  }
  return "";
}

export function jwksResolver(kp: Keypair): JwksResolver {
  return (keyid: string): Promise<JsonWebKey | null> =>
    Promise.resolve(keyid === kp.keyid ? kp.publicJwk : null);
}

export function fixtureIpLists(provider: string, cidrs: string[]): IpListStore {
  return { get: (p) => (p === provider ? cidrs : []) };
}
