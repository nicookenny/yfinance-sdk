/**
 * Quote, profile, and related metadata via `quoteSummary`.
 *
 * Yahoo wraps numbers as `{ raw, fmt, longFmt }` and dates as `{ raw, fmt }`.
 * Even with `formatted=false` some fields stay wrapped, so {@link unwrap}
 * defensively collapses them to plain values, and `*Date` epoch seconds are
 * surfaced as `Date`s by the typed accessors.
 */
import type { YahooClient } from "../core/client.js";
import { DataError, NotFoundError } from "../core/errors.js";
import type {
  Calendar,
  FastInfo,
  Info,
  QuoteSummary,
  RecommendationRow,
} from "./quote-types.js";

const QUOTE_SUMMARY_BASE =
  "https://query1.finance.yahoo.com/v10/finance/quoteSummary/";

/** Modules merged into `info()`, matching yfinance's default selection. */
export const INFO_MODULES = [
  "assetProfile",
  "summaryProfile",
  "summaryDetail",
  "quoteType",
  "defaultKeyStatistics",
  "price",
  "financialData",
] as const;

interface QuoteSummaryResponse {
  quoteSummary?: {
    result?: Array<Record<string, unknown>> | null;
    error?: { code?: string; description?: string } | null;
  };
}

/** Fetches the requested `quoteSummary` modules for a symbol. */
export async function fetchQuoteSummary(
  client: YahooClient,
  symbol: string,
  modules: readonly string[],
  signal?: AbortSignal,
): Promise<QuoteSummary> {
  const url = QUOTE_SUMMARY_BASE + encodeURIComponent(symbol);
  const json = await client.getJson<QuoteSummaryResponse>(url, {
    params: { modules: modules.join(","), formatted: false },
    crumb: true,
    ...(signal ? { signal } : {}),
  });

  const err = json.quoteSummary?.error;
  if (err) {
    if (err.code === "Not Found") {
      throw new NotFoundError(`No data found for symbol "${symbol}"`, { symbol });
    }
    throw new DataError(
      `quoteSummary error for "${symbol}": ${err.description ?? err.code ?? "unknown"}`,
    );
  }

  const result = json.quoteSummary?.result?.[0];
  if (!result) {
    throw new NotFoundError(`No data found for symbol "${symbol}"`, { symbol });
  }

  const out: QuoteSummary = {};
  for (const [moduleName, value] of Object.entries(result)) {
    out[moduleName] = unwrap(value) as Record<string, unknown>;
  }
  return out;
}

/** Fetches and flattens the default info modules into one record. */
export async function fetchInfo(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<Info> {
  const summary = await fetchQuoteSummary(client, symbol, INFO_MODULES, signal);
  const info: Info = {};
  for (const moduleData of Object.values(summary)) {
    Object.assign(info, moduleData);
  }
  return info;
}

/** Builds a lightweight snapshot from the cheap price/summary modules. */
export async function fetchFastInfo(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<FastInfo> {
  const s = await fetchQuoteSummary(
    client,
    symbol,
    ["price", "summaryDetail", "defaultKeyStatistics"],
    signal,
  );
  const price = s.price ?? {};
  const detail = s.summaryDetail ?? {};
  const stats = s.defaultKeyStatistics ?? {};

  return clean<FastInfo>({
    symbol: str(price.symbol),
    currency: str(price.currency),
    exchange: str(price.exchangeName),
    quoteType: str(price.quoteType),
    lastPrice: num(price.regularMarketPrice),
    previousClose: num(price.regularMarketPreviousClose ?? detail.previousClose),
    open: num(detail.open ?? price.regularMarketOpen),
    dayHigh: num(detail.dayHigh ?? price.regularMarketDayHigh),
    dayLow: num(detail.dayLow ?? price.regularMarketDayLow),
    marketCap: num(price.marketCap ?? detail.marketCap),
    shares: num(stats.sharesOutstanding),
    fiftyDayAverage: num(detail.fiftyDayAverage),
    twoHundredDayAverage: num(detail.twoHundredDayAverage),
    yearHigh: num(detail.fiftyTwoWeekHigh),
    yearLow: num(detail.fiftyTwoWeekLow),
  });
}

/** Reads the upcoming earnings/dividend calendar. */
export async function fetchCalendar(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<Calendar> {
  const s = await fetchQuoteSummary(
    client,
    symbol,
    ["calendarEvents", "earnings"],
    signal,
  );
  const events = (s.calendarEvents ?? {}) as Record<string, unknown>;
  const earnings = (events.earnings ?? {}) as Record<string, unknown>;
  const dates = asArray(earnings.earningsDate)
    .map((d) => num(d))
    .filter((n): n is number => n !== undefined)
    .map(epochToDate);

  return clean<Calendar>({
    earningsDates: dates,
    earningsHigh: num(earnings.earningsHigh),
    earningsLow: num(earnings.earningsLow),
    earningsAverage: num(earnings.earningsAverage),
    revenueHigh: num(earnings.revenueHigh),
    revenueLow: num(earnings.revenueLow),
    revenueAverage: num(earnings.revenueAverage),
    exDividendDate: optDate(events.exDividendDate),
    dividendDate: optDate(events.dividendDate),
  });
}

/** Reads the analyst recommendation trend (one row per period). */
export async function fetchRecommendations(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<RecommendationRow[]> {
  const s = await fetchQuoteSummary(client, symbol, ["recommendationTrend"], signal);
  const trend = asArray(
    (s.recommendationTrend as Record<string, unknown> | undefined)?.trend,
  );
  return trend.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      period: str(r.period) ?? "",
      strongBuy: num(r.strongBuy) ?? 0,
      buy: num(r.buy) ?? 0,
      hold: num(r.hold) ?? 0,
      sell: num(r.sell) ?? 0,
      strongSell: num(r.strongSell) ?? 0,
    };
  });
}

/**
 * Recursively collapses Yahoo's `{ raw, fmt, longFmt }` wrappers to plain
 * values, leaving everything else untouched.
 */
export function unwrap(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrap);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("raw" in obj && Object.keys(obj).every((k) => ["raw", "fmt", "longFmt"].includes(k))) {
      return obj.raw;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = unwrap(v);
    return out;
  }
  return value;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "object" && value !== null && "raw" in value) {
    const raw = (value as { raw: unknown }).raw;
    return typeof raw === "number" ? raw : undefined;
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function epochToDate(seconds: number): Date {
  return new Date(seconds * 1000);
}

function optDate(value: unknown): Date | undefined {
  const n = num(value);
  return n === undefined ? undefined : epochToDate(n);
}

/** Drops `undefined` properties so optional fields stay truly absent. */
function clean<T>(obj: Record<string, unknown>): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj as T;
}
