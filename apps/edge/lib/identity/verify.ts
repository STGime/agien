import type { IdentityRequest, IpListStore, JwksResolver, VerifyResult } from "./types.ts";
import { matchPublisherIp, resolveProvider } from "./publishers.ts";
import { verifyWebBotAuth } from "./webbotauth.ts";

export interface VerifierDeps {
  resolveJwks: JwksResolver;
  ipLists: IpListStore;
}

/**
 * Determine whether a request carries a verifiable declared identity.
 *
 * Precedence: a Web Bot Auth signature (cryptographic) wins when signature
 * headers are present; otherwise a publisher User-Agent token is checked
 * against the publisher's published IP ranges. With neither, the request has
 * no declared identity.
 */
export async function verify(req: IdentityRequest, deps: VerifierDeps): Promise<VerifyResult> {
  const hasSignature = "signature" in req.headers && "signature-input" in req.headers;

  if (hasSignature) {
    const out = await verifyWebBotAuth(req, deps.resolveJwks);
    return {
      identified: true,
      verified: out.verified,
      provider: out.provider,
      method: "web_bot_auth",
      reason_codes: [out.reason_code],
    };
  }

  const provider = resolveProvider(req.userAgent);
  if (provider) {
    const inList = matchPublisherIp(deps.ipLists, provider, req.ip);
    return {
      identified: true,
      verified: inList,
      provider,
      method: "ip_list",
      reason_codes: [inList ? "ua_publisher_ip_verified" : "ua_publisher_ip_mismatch"],
    };
  }

  return {
    identified: false,
    verified: false,
    provider: null,
    method: null,
    reason_codes: ["no_declared_identity"],
  };
}
