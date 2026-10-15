import { assertEquals } from "jsr:@std/assert@1";
import { ipInCidr, resolveProvider } from "./publishers.ts";
import { vendoredIpLists } from "./ip_lists.ts";
import { verify } from "./verify.ts";
import { fixtureIpLists } from "./test_support.ts";

Deno.test("vendoredIpLists loads published ranges (openai non-empty, meta empty)", () => {
  assertEquals(vendoredIpLists.get("openai").length > 0, true);
  assertEquals(vendoredIpLists.get("google").length > 0, true);
  assertEquals(vendoredIpLists.get("meta"), []);
  assertEquals(vendoredIpLists.get("unknown-provider"), []);
});

Deno.test("resolveProvider maps every declared publisher token", () => {
  assertEquals(resolveProvider("ChatGPT-User/1.0 (+https://chatgpt.com)"), "openai");
  assertEquals(resolveProvider("GPTBot/1.0"), "openai");
  assertEquals(resolveProvider("OAI-SearchBot/1.0"), "openai");
  assertEquals(resolveProvider("ClaudeBot/1.0"), "anthropic");
  assertEquals(resolveProvider("Claude-User/1.0"), "anthropic");
  assertEquals(resolveProvider("Claude-SearchBot/1.0"), "anthropic");
  assertEquals(resolveProvider("PerplexityBot/1.0"), "perplexity");
  assertEquals(resolveProvider("Perplexity-User/1.0"), "perplexity");
  assertEquals(resolveProvider("Google-Agent/0.1"), "google");
  assertEquals(resolveProvider("Meta-ExternalAgent/1.0"), "meta");
  assertEquals(resolveProvider("Meta-ExternalFetcher/1.0"), "meta");
});

Deno.test("resolveProvider returns null for a stock browser UA", () => {
  const chrome =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  assertEquals(resolveProvider(chrome), null);
});

Deno.test("ipInCidr matches IPv4 and IPv6", () => {
  assertEquals(ipInCidr("192.0.2.10", "192.0.2.0/24"), true);
  assertEquals(ipInCidr("203.0.113.7", "192.0.2.0/24"), false);
  assertEquals(ipInCidr("2001:db8::1", "2001:db8::/32"), true);
  assertEquals(ipInCidr("2001:db9::1", "2001:db8::/32"), false);
});

Deno.test("verify: ChatGPT-User from in-list IP -> ua_publisher_ip_verified", async () => {
  const deps = {
    resolveJwks: () => Promise.resolve(null),
    ipLists: fixtureIpLists("openai", ["192.0.2.0/24"]),
  };
  const req = {
    method: "GET",
    url: "https://example.com/",
    ip: "192.0.2.10",
    userAgent: "ChatGPT-User/1.0",
    headers: {},
  };
  assertEquals(await verify(req, deps), {
    identified: true,
    verified: true,
    provider: "openai",
    method: "ip_list",
    reason_codes: ["ua_publisher_ip_verified"],
  });
});

Deno.test("verify: ChatGPT-User from 203.0.113.7 -> ua_publisher_ip_mismatch", async () => {
  const deps = {
    resolveJwks: () => Promise.resolve(null),
    ipLists: fixtureIpLists("openai", ["192.0.2.0/24"]),
  };
  const req = {
    method: "GET",
    url: "https://example.com/",
    ip: "203.0.113.7",
    userAgent: "ChatGPT-User/1.0",
    headers: {},
  };
  assertEquals(await verify(req, deps), {
    identified: true,
    verified: false,
    provider: "openai",
    method: "ip_list",
    reason_codes: ["ua_publisher_ip_mismatch"],
  });
});

Deno.test("verify: stock Chrome with no signature -> no_declared_identity", async () => {
  const deps = { resolveJwks: () => Promise.resolve(null), ipLists: fixtureIpLists("openai", []) };
  const req = {
    method: "GET",
    url: "https://example.com/",
    ip: "203.0.113.7",
    userAgent: "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36",
    headers: {},
  };
  assertEquals(await verify(req, deps), {
    identified: false,
    verified: false,
    provider: null,
    method: null,
    reason_codes: ["no_declared_identity"],
  });
});
