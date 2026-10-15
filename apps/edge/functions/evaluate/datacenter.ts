import { ipInCidr } from "../../lib/identity/publishers.ts";

/**
 * Static v0 allowlist of well-known datacenter/cloud IPv4 ranges, used to flag
 * requests originating from hosting infrastructure (a strong automation
 * signal). This is a placeholder pending a vendored MaxMind-style ASN database
 * in Sprint 1; ranges are intentionally a small, stable sample and are not
 * exhaustive.
 */
const DATACENTER_CIDRS: readonly string[] = [
  // AWS (us-east-1 sample)
  "3.0.0.0/9",
  "18.0.0.0/9",
  // Google Cloud (sample)
  "34.0.0.0/9",
  "35.0.0.0/9",
  // Azure (sample)
  "13.64.0.0/11",
  "20.0.0.0/10",
  // DigitalOcean
  "159.89.0.0/16",
  "165.22.0.0/16",
  // Hetzner
  "116.203.0.0/16",
  "167.235.0.0/16",
  // Oracle Cloud
  "129.146.0.0/16",
  "140.238.0.0/16",
];

export function isDatacenterIp(ip: string): boolean {
  for (const cidr of DATACENTER_CIDRS) {
    if (ipInCidr(ip, cidr)) return true;
  }
  return false;
}
