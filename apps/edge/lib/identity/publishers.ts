import type { IpListStore } from "./types.ts";

/**
 * User-Agent product tokens that declare a publisher, mapped to their provider
 * slug. Matching is exact and case-sensitive, as required by the bot-token
 * conventions these publishers publish.
 */
export const UA_PROVIDERS: Readonly<Record<string, string>> = {
  GPTBot: "openai",
  "OAI-SearchBot": "openai",
  "ChatGPT-User": "openai",
  ClaudeBot: "anthropic",
  "Claude-User": "anthropic",
  "Claude-SearchBot": "anthropic",
  PerplexityBot: "perplexity",
  "Perplexity-User": "perplexity",
  "Google-Agent": "google",
  "Meta-ExternalAgent": "meta",
  "Meta-ExternalFetcher": "meta",
};

// A product token: Name optionally followed by /version. Covers GPTBot/1.0,
// ChatGPT-User/1.0, Google-Agent/0.1, and bare tokens.
const TOKEN_RE = /[A-Za-z0-9._-]+(?:\/[0-9A-Za-z._-]+)?/g;

/**
 * Return the provider slug declared by the first matching product token in a
 * User-Agent string, or null when no known publisher token is present.
 */
export function resolveProvider(userAgent: string): string | null {
  for (const match of userAgent.matchAll(TOKEN_RE)) {
    const name = match[0].split("/", 1)[0];
    const provider = UA_PROVIDERS[name];
    if (provider) return provider;
  }
  return null;
}

/**
 * True when `ip` falls within the `cidr` range. Supports IPv4 and IPv6. The
 * IPv6 path handles `::` compression and full hex groups but not IPv4-mapped
 * IPv6 tails (e.g. `::ffff:1.2.3.4`), which are outside the published crawler
 * ranges this verifier is aimed at.
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.lastIndexOf("/");
  const net = slash === -1 ? cidr : cidr.slice(0, slash);
  const prefix = slash === -1 ? null : parseInt(cidr.slice(slash + 1), 10);

  if (ip.includes(":")) {
    const ipInt = ipv6ToBigInt(ip);
    const netInt = ipv6ToBigInt(net);
    if (ipInt === null || netInt === null) return false;
    const bits = prefix ?? 128;
    const mask = bits === 0 ? 0n : (~0n << BigInt(128 - bits)) & ((1n << 128n) - 1n);
    return (ipInt & mask) === (netInt & mask);
  }

  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(net);
  if (ipInt === null || netInt === null) return false;
  const bits = prefix ?? 32;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((netInt & mask) >>> 0);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n * 256 + v) >>> 0;
  }
  return n;
}

function ipv6ToBigInt(addr: string): bigint | null {
  const zone = addr.indexOf("%");
  if (zone !== -1) addr = addr.slice(0, zone);

  let groups: number[];
  const dc = addr.indexOf("::");
  if (dc !== -1) {
    const left = addr.slice(0, dc);
    const right = addr.slice(dc + 2);
    const l = left === "" ? [] : left.split(":").map(hex);
    const r = right === "" ? [] : right.split(":").map(hex);
    const missing = 8 - l.length - r.length;
    if (missing < 0) return null;
    groups = [...l, ...Array(missing).fill(0), ...r];
  } else {
    groups = addr.split(":").map(hex);
  }

  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups) {
    if (!Number.isInteger(g) || g < 0 || g > 0xffff) return null;
    n = (n << 16n) | BigInt(g);
  }
  return n;
}

function hex(g: string): number {
  if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return NaN;
  return parseInt(g, 16);
}

/** True when `ip` falls inside any of `store`'s ranges for `provider`. */
export function matchPublisherIp(store: IpListStore, provider: string, ip: string): boolean {
  for (const cidr of store.get(provider)) {
    if (ipInCidr(ip, cidr)) return true;
  }
  return false;
}
