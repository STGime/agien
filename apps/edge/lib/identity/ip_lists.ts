import type { IpListStore } from "./types.ts";
import anthropic from "../../../../data/ip-lists/anthropic.json" with { type: "json" };
import google from "../../../../data/ip-lists/google.json" with { type: "json" };
import meta from "../../../../data/ip-lists/meta.json" with { type: "json" };
import openai from "../../../../data/ip-lists/openai.json" with { type: "json" };
import perplexity from "../../../../data/ip-lists/perplexity.json" with { type: "json" };

const LISTS: Readonly<Record<string, string[]>> = {
  anthropic,
  google,
  meta,
  openai,
  perplexity,
};

/** The default store backed by the vendored data/ip-lists snapshots. */
export const vendoredIpLists: IpListStore = {
  get: (provider: string) => LISTS[provider] ?? [],
};
