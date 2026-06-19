/**
 * Analyst data: price targets and earnings/revenue/EPS estimates.
 *
 * Price targets come from the `financialData` module; the estimate tables come
 * from `earningsTrend`, which holds one entry per period (0q, +1q, 0y, +1y, …).
 */
import type { YahooClient } from "../core/client.js";
import { fetchQuoteSummary } from "./quote.js";

/** Analyst price target consensus. */
export interface PriceTargets {
  current?: number;
  high?: number;
  low?: number;
  mean?: number;
  median?: number;
  numberOfAnalysts?: number;
  recommendationMean?: number;
  recommendationKey?: string;
}

/** One row of a period-keyed estimate table. */
export interface EstimateRow {
  period: string;
  avg?: number;
  low?: number;
  high?: number;
  yearAgoValue?: number;
  numberOfAnalysts?: number;
  growth?: number;
}

/** One row of the EPS trend table. */
export interface EpsTrendRow {
  period: string;
  current?: number;
  days7Ago?: number;
  days30Ago?: number;
  days60Ago?: number;
  days90Ago?: number;
}

export async function fetchPriceTargets(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<PriceTargets> {
  const s = await fetchQuoteSummary(client, symbol, ["financialData"], signal);
  const f = (s.financialData ?? {}) as Record<string, unknown>;
  return cleanObj<PriceTargets>({
    current: num(f.currentPrice),
    high: num(f.targetHighPrice),
    low: num(f.targetLowPrice),
    mean: num(f.targetMeanPrice),
    median: num(f.targetMedianPrice),
    numberOfAnalysts: num(f.numberOfAnalystOpinions),
    recommendationMean: num(f.recommendationMean),
    recommendationKey: str(f.recommendationKey),
  });
}

export async function fetchEarningsEstimate(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<EstimateRow[]> {
  return estimateTable(client, symbol, "earningsEstimate", signal);
}

export async function fetchRevenueEstimate(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<EstimateRow[]> {
  return estimateTable(client, symbol, "revenueEstimate", signal);
}

export async function fetchEpsTrend(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<EpsTrendRow[]> {
  const trend = await earningsTrend(client, symbol, signal);
  return trend.map((t) => {
    const e = (t.epsTrend ?? {}) as Record<string, unknown>;
    return cleanObj<EpsTrendRow>({
      period: str(t.period) ?? "",
      current: num(e.current),
      days7Ago: num(e["7daysAgo"]),
      days30Ago: num(e["30daysAgo"]),
      days60Ago: num(e["60daysAgo"]),
      days90Ago: num(e["90daysAgo"]),
    });
  });
}

async function estimateTable(
  client: YahooClient,
  symbol: string,
  field: "earningsEstimate" | "revenueEstimate",
  signal?: AbortSignal,
): Promise<EstimateRow[]> {
  const trend = await earningsTrend(client, symbol, signal);
  return trend.map((t) => {
    const e = (t[field] ?? {}) as Record<string, unknown>;
    return cleanObj<EstimateRow>({
      period: str(t.period) ?? "",
      avg: num(e.avg),
      low: num(e.low),
      high: num(e.high),
      yearAgoValue: num(e.yearAgoEps ?? e.yearAgoRevenue),
      numberOfAnalysts: num(e.numberOfAnalysts),
      growth: num(e.growth),
    });
  });
}

async function earningsTrend(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<Array<Record<string, unknown>>> {
  const s = await fetchQuoteSummary(client, symbol, ["earningsTrend"], signal);
  const trend = (s.earningsTrend as Record<string, unknown> | undefined)?.trend;
  return Array.isArray(trend) ? (trend as Array<Record<string, unknown>>) : [];
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
}
function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function cleanObj<T>(obj: Record<string, unknown>): T {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj as T;
}
