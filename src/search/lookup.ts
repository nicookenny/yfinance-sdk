/**
 * Symbol lookup via `/v1/finance/lookup`.
 *
 * Like search but tuned for resolving symbols, with an optional asset-type
 * filter (equity, etf, mutualfund, index, currency, cryptocurrency, future).
 */
import type { YahooClient } from "../core/client.js";

const LOOKUP_URL = "https://query1.finance.yahoo.com/v1/finance/lookup";

export type LookupType =
  | "all"
  | "equity"
  | "etf"
  | "mutualfund"
  | "index"
  | "currency"
  | "cryptocurrency"
  | "future";

export interface LookupResult {
  symbol: string;
  shortName?: string;
  longName?: string;
  exchange?: string;
  quoteType?: string;
  industryName?: string;
}

export interface LookupOptions {
  type?: LookupType;
  count?: number;
  signal?: AbortSignal;
}

interface RawLookup {
  finance?: {
    result?: Array<{ documents?: Array<Record<string, unknown>> }>;
    error?: { code?: string; description?: string } | null;
  };
}

/** Resolves a free-text query to matching symbols. */
export async function lookup(
  client: YahooClient,
  query: string,
  options: LookupOptions = {},
): Promise<LookupResult[]> {
  const json = await client.getJson<RawLookup>(LOOKUP_URL, {
    params: {
      query,
      type: options.type ?? "all",
      count: options.count ?? 25,
      formatted: false,
    },
    crumb: true,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const documents = json.finance?.result?.[0]?.documents ?? [];
  return documents
    .filter((d) => typeof d.symbol === "string")
    .map((d): LookupResult => clean({
      symbol: d.symbol as string,
      shortName: str(d.shortName),
      longName: str(d.longName),
      exchange: str(d.exchange),
      quoteType: str(d.quoteType),
      industryName: str(d.industryName),
    }));
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function clean<T>(obj: Record<string, unknown>): T {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj as T;
}
