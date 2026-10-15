export type IdentityMethod = "ip_list" | "web_bot_auth" | null;

export interface VerifyResult {
  identified: boolean;
  verified: boolean;
  provider: string | null;
  method: IdentityMethod;
  reason_codes: string[];
}

/**
 * The smallest slice of an incoming request the verifier needs. Nothing more is
 * read, so no field values, bodies, or cookies are ever touched.
 */
export interface IdentityRequest {
  method: string;
  /** Full request URL (scheme + authority + path + query). */
  url: string;
  /** Client address (IPv4 or IPv6). */
  ip: string;
  userAgent: string;
  /** Header map; keys are lower-cased. */
  headers: Record<string, string>;
}

/** Resolves a public JWK (RFC 7517) by key id. Returns null when unknown. */
export type JwksResolver = (keyid: string) => Promise<JsonWebKey | null>;

/** Supplies CIDR ranges (IPv4 or IPv6) for a provider slug. */
export interface IpListStore {
  get(provider: string): string[];
}
