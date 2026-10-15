// Regenerate the vendored publisher IP-range snapshots in data/ip-lists/.
//
// Run from the repo root:
//   deno run --allow-net --allow-write scripts/refresh_ip_lists.ts
//
// Each source is a Google-Cloud-style JSON document with a "prefixes" array of
// { "ipv4Prefix" | "ipv6Prefix": "..." } objects. Meta publishes no
// machine-readable crawler range feed, so meta.json stays empty until it does.

interface Source {
  provider: string;
  urls: string[];
}

const SOURCES: Source[] = [
  {
    provider: "openai",
    urls: [
      "https://openai.com/gptbot.json",
      "https://openai.com/searchbot.json",
      "https://openai.com/chatgpt-user.json",
    ],
  },
  { provider: "anthropic", urls: ["https://claude.com/crawling/bots.json"] },
  {
    provider: "perplexity",
    urls: [
      "https://www.perplexity.com/perplexitybot.json",
      "https://www.perplexity.com/perplexity-user.json",
    ],
  },
  {
    provider: "google",
    urls: [
      "https://developers.google.com/search/apis/ipranges/googlebot.json",
      "https://developers.google.com/search/apis/ipranges/special-crawlers.json",
    ],
  },
  // Meta does not publish a per-bot IP-range feed (Meta-ExternalAgent /
  // Meta-ExternalFetcher). See:
  // https://developers.facebook.com/docs/sharing/webmasters/web-crawlers
  { provider: "meta", urls: [] },
];

interface PrefixDoc {
  prefixes?: Array<{ ipv4Prefix?: string; ipv6Prefix?: string }>;
}

async function fetchPrefixes(url: string): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = (await res.json()) as PrefixDoc;
  const out: string[] = [];
  for (const p of doc.prefixes ?? []) {
    if (p.ipv4Prefix) out.push(p.ipv4Prefix);
    if (p.ipv6Prefix) out.push(p.ipv6Prefix);
  }
  return out;
}

const dataDir = new URL("../data/ip-lists/", import.meta.url);
await Deno.mkdir(dataDir, { recursive: true });

for (const source of SOURCES) {
  const all: string[] = [];
  for (const url of source.urls) {
    try {
      const prefixes = await fetchPrefixes(url);
      console.log(`${source.provider}: ${prefixes.length} prefixes from ${url}`);
      all.push(...prefixes);
    } catch (err) {
      console.warn(
        `${source.provider}: SKIP ${url} (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }
  const unique = [...new Set(all)].sort();
  const outUrl = new URL(`${source.provider}.json`, dataDir);
  await Deno.writeTextFile(outUrl, JSON.stringify(unique, null, 2) + "\n");
  console.log(`wrote ${outUrl.pathname} (${unique.length} ranges)`);
}
