/**
 * Symbol/news search via `/v1/finance/search`.
 */
import type { YahooClient } from "../core/client.js";

const SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";

export interface SearchQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
  typeDisp?: string;
  score?: number;
}

export interface SearchNews {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: Date;
  type?: string;
}

export interface SearchResult {
  quotes: SearchQuote[];
  news: SearchNews[];
}

export interface SearchOptions {
  quotesCount?: number;
  newsCount?: number;
  signal?: AbortSignal;
}

interface RawSearch {
  quotes?: Array<Record<string, unknown>>;
  news?: Array<Record<string, unknown>>;
}

/** Searches for symbols and related news. */
export async function search(
  client: YahooClient,
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const json = await client.getJson<RawSearch>(SEARCH_URL, {
    params: {
      q: query,
      quotesCount: options.quotesCount ?? 8,
      newsCount: options.newsCount ?? 8,
    },
    crumb: false,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const quotes = (json.quotes ?? [])
    .filter((q) => typeof q.symbol === "string")
    .map((q): SearchQuote => clean({
      symbol: q.symbol as string,
      shortname: str(q.shortname),
      longname: str(q.longname),
      exchange: str(q.exchange),
      exchDisp: str(q.exchDisp),
      quoteType: str(q.quoteType),
      typeDisp: str(q.typeDisp),
      score: num(q.score),
    }));

  const news = (json.news ?? []).map((n): SearchNews => clean({
    uuid: str(n.uuid),
    title: str(n.title),
    publisher: str(n.publisher),
    link: str(n.link),
    type: str(n.type),
    providerPublishTime:
      typeof n.providerPublishTime === "number"
        ? new Date(n.providerPublishTime * 1000)
        : undefined,
  }));

  return { quotes, news };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}
function clean<T>(obj: Record<string, unknown>): T {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj as T;
}
