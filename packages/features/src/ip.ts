/** IPv4/IPv6 CIDR matching for the shared datacenter allowlist. */

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

export function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.lastIndexOf("/");
  const net = slash === -1 ? cidr : cidr.slice(0, slash);
  const prefix = slash === -1 ? 32 : parseInt(cidr.slice(slash + 1), 10);

  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(net);
  if (ipInt === null || netInt === null) return false;
  const bits = prefix;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((netInt & mask) >>> 0);
}

export function isDatacenterIp(ip: string, cidrs: readonly string[]): boolean {
  for (const cidr of cidrs) {
    if (ipInCidr(ip, cidr)) return true;
  }
  return false;
}
