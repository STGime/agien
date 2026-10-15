import { assert, assertEquals } from "jsr:@std/assert@1";
import { verify } from "./verify.ts";
import { verifyWebBotAuth } from "./webbotauth.ts";
import {
  fixtureIpLists,
  generateKeypair,
  jwksResolver,
  type Keypair,
  signedRequest,
} from "./test_support.ts";

const kp: Keypair = await generateKeypair();
const now = () => Math.floor(Date.now() / 1000);
const validOpts = () => ({ created: now() - 10, expires: now() + 600, tag: "web-bot-auth" });

Deno.test("valid signature verifies with provider chatgpt.com", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  assertEquals(await verifyWebBotAuth(req, jwksResolver(kp)), {
    verified: true,
    provider: "chatgpt.com",
    reason_code: "web_bot_auth_verified",
  });
});

Deno.test("tampered path -> web_bot_auth_invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/bar", { ...validOpts(), path: "/foo" });
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("expired signature -> web_bot_auth_expired", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", {
    created: now() - 7200,
    expires: now() - 3600,
    tag: "web-bot-auth",
  });
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_expired");
});

Deno.test("missing tag -> web_bot_auth_invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", {
    created: now() - 10,
    expires: now() + 600,
  });
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("wrong tag -> web_bot_auth_invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", {
    ...validOpts(),
    tag: "other-tag",
  });
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("created-expires span > 24h -> web_bot_auth_invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", {
    created: now() - 90000,
    expires: now() + 3600,
    tag: "web-bot-auth",
  });
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("no created (span check skipped) -> verifies", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", {
    expires: now() + 600,
    tag: "web-bot-auth",
  });
  assertEquals(
    (await verifyWebBotAuth(req, jwksResolver(kp))).reason_code,
    "web_bot_auth_verified",
  );
});

Deno.test("no expires (expiry check skipped) -> verifies", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", {
    created: now() - 10,
    tag: "web-bot-auth",
  });
  assertEquals(
    (await verifyWebBotAuth(req, jwksResolver(kp))).reason_code,
    "web_bot_auth_verified",
  );
});

Deno.test("malformed signature-input (no '=') -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  req.headers["signature-input"] = "sig1";
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("signature-input without '(' -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  req.headers["signature-input"] = "sig1=abc";
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("signature-input unterminated list -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  req.headers["signature-input"] = "sig1=(@method @path";
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("unknown covered component -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", {
    ...validOpts(),
    components: ["@authority", "@method", "@path", "x-unknown", "signature-agent"],
  });
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("missing keyid -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  req.headers["signature-input"] = req.headers["signature-input"].replace(/;keyid="[^"]*"/, "");
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("unknown keyid (resolver returns null) -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  assertEquals(
    (await verifyWebBotAuth(req, () => Promise.resolve(null))).reason_code,
    "web_bot_auth_invalid",
  );
});

Deno.test("malformed signature header (no '=') -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  req.headers["signature"] = "garbage";
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("signature header with wrong label -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  req.headers["signature"] = "sig2=:AAAA:";
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("signature header with bad base64 -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  req.headers["signature"] = "sig1=:!!!:";
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("invalid request URL -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  req.url = "://not a url";
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("invalid JWK (importKey throws) -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  const resolver = (): Promise<JsonWebKey | null> =>
    Promise.resolve({ kty: "OKP", crv: "Ed25519", x: "!!!not-base64url!!!" });
  assertEquals((await verifyWebBotAuth(req, resolver)).reason_code, "web_bot_auth_invalid");
});

Deno.test("signature-input with a bare flag parameter -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  req.headers["signature-input"] = `${req.headers["signature-input"]};alg`;
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("missing signature-input header -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  delete req.headers["signature-input"];
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("missing signature header -> invalid", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  delete req.headers["signature"];
  assertEquals((await verifyWebBotAuth(req, jwksResolver(kp))).reason_code, "web_bot_auth_invalid");
});

Deno.test("valid signature without signature-agent -> provider null", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", {
    ...validOpts(),
    components: ["@authority", "@method", "@path"],
  });
  delete req.headers["signature-agent"];
  const out = await verifyWebBotAuth(req, jwksResolver(kp));
  assertEquals(out.verified, true);
  assertEquals(out.provider, null);
});

Deno.test("tampered signature without signature-agent -> provider null", async () => {
  const req = await signedRequest(kp, "https://example.com/bar", {
    ...validOpts(),
    path: "/foo",
    components: ["@authority", "@method", "@path"],
  });
  delete req.headers["signature-agent"];
  const out = await verifyWebBotAuth(req, jwksResolver(kp));
  assertEquals(out.verified, false);
  assertEquals(out.provider, null);
});

Deno.test("benchmark: verify() < 2ms median over 1000 iterations", async () => {
  const req = await signedRequest(kp, "https://example.com/foo", validOpts());
  const deps = { resolveJwks: jwksResolver(kp), ipLists: fixtureIpLists("openai", []) };
  const durations: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const t0 = performance.now();
    await verify(req, deps);
    durations.push(performance.now() - t0);
  }
  durations.sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)];
  console.log(`median verify() latency: ${median.toFixed(3)} ms (n=1000)`);
  assert(median < 2, `median ${median.toFixed(3)} ms >= 2 ms`);
});
