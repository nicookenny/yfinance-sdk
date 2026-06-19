/**
 * Equity/fund screener via `/v1/finance/screener`.
 *
 * Two modes:
 *  - **Predefined**: pass a saved screen key (e.g. `"day_gainers"`,
 *    `"most_actives"`) — a GET against the predefined endpoint.
 *  - **Custom**: pass a {@link QueryNode} built with the query helpers — a POST
 *    with the screener body.
 */
import type { YahooClient } from "../core/client.js";
import { DataError } from "../core/errors.js";
import type { QueryNode } from "./query.js";

const SCREENER_URL = "https://query1.finance.yahoo.com/v1/finance/screener";
const PREDEFINED_URL =
  "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved";

/** A screener result row (Yahoo quote shape; common fields typed). */
export interface ScreenerQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  exchange?: string;
  quoteType?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
  [key: string]: unknown;
}

export interface ScreenerResult {
  quotes: ScreenerQuote[];
  total: number;
}

export interface ScreenOptions {
  count?: number;
  offset?: number;
  sortField?: string;
  sortType?: "ASC" | "DESC";
  quoteType?: "EQUITY" | "MUTUALFUND" | "ETF" | "INDEX" | "FUTURE";
  signal?: AbortSignal;
}

interface RawScreener {
  finance?: {
    result?: Array<{ quotes?: Array<Record<string, unknown>>; total?: number }>;
    error?: { code?: string; description?: string } | null;
  };
}

/** Runs a predefined or custom screen and returns matching quotes. */
export async function screen(
  client: YahooClient,
  query: string | QueryNode,
  options: ScreenOptions = {},
): Promise<ScreenerResult> {
  const json =
    typeof query === "string"
      ? await runPredefined(client, query, options)
      : await runCustom(client, query, options);

  const err = json.finance?.error;
  if (err) {
    throw new DataError(
      `screener error: ${err.description ?? err.code ?? "unknown"}`,
    );
  }
  const result = json.finance?.result?.[0];
  const quotes = (result?.quotes ?? [])
    .filter((q) => typeof q.symbol === "string")
    .map((q) => q as ScreenerQuote);
  return { quotes, total: result?.total ?? quotes.length };
}

function runPredefined(
  client: YahooClient,
  key: string,
  options: ScreenOptions,
): Promise<RawScreener> {
  return client.getJson<RawScreener>(PREDEFINED_URL, {
    params: {
      scrIds: key,
      count: options.count ?? 25,
      ...(options.offset !== undefined ? { start: options.offset } : {}),
    },
    crumb: true,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

function runCustom(
  client: YahooClient,
  query: QueryNode,
  options: ScreenOptions,
): Promise<RawScreener> {
  const body = {
    size: options.count ?? 25,
    offset: options.offset ?? 0,
    sortField: options.sortField ?? "intradaymarketcap",
    sortType: options.sortType ?? "DESC",
    quoteType: options.quoteType ?? "EQUITY",
    query,
    userId: "",
    userIdType: "guid",
  };
  return client.postJson<RawScreener>(SCREENER_URL, body, {
    crumb: true,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
