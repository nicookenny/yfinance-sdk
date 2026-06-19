/**
 * Shared fetch/parse for the `sectors/{key}` and `industries/{key}` endpoints.
 *
 * These return `formatted=true` payloads (values wrapped as `{ raw, fmt }`), so
 * the response is unwrapped before the typed extractors read it.
 */
import type { YahooClient } from "../core/client.js";
import { DataError, NotFoundError } from "../core/errors.js";
import { unwrap } from "../ticker/quote.js";
import type {
  DomainOverview,
  RankedCompany,
  SymbolName,
  TopCompany,
} from "./types.js";

const BASE = "https://query1.finance.yahoo.com/v1/finance";

/** Fetches and unwraps a domain payload (`data` object) for a sectors/industries key. */
export async function fetchDomain(
  client: YahooClient,
  kind: "sectors" | "industries",
  key: string,
  region: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const url = `${BASE}/${kind}/${encodeURIComponent(key)}`;
  const json = await client.getJson<Record<string, unknown>>(url, {
    params: { formatted: true, withReturns: true, lang: "en-US", region },
    crumb: true,
    ...(signal ? { signal } : {}),
  });

  const error = (json as { error?: unknown }).error;
  if (error) {
    throw new DataError(`domain error for "${key}": ${JSON.stringify(error)}`);
  }
  const data = (json.data ?? json) as Record<string, unknown>;
  if (!data || Object.keys(data).length === 0) {
    throw new NotFoundError(`No domain data for "${key}"`);
  }
  return unwrap(data) as Record<string, unknown>;
}

export function parseOverview(data: Record<string, unknown>): DomainOverview {
  const o = (data.overview ?? {}) as Record<string, unknown>;
  return o as DomainOverview;
}

export function parseTopCompanies(data: Record<string, unknown>): TopCompany[] {
  return asArray(data.topCompanies).map((c) => {
    const r = c as Record<string, unknown>;
    return clean<TopCompany>({
      symbol: str(r.symbol) ?? "",
      name: str(r.name),
      rating: str(r.rating),
      marketWeight: num(r.marketWeight),
    });
  });
}

/** Maps a list or `{symbol: name}` map into a SymbolName[]. */
export function parseSymbolNames(value: unknown): SymbolName[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => v as Record<string, unknown>)
      .filter((v) => typeof v.symbol === "string")
      .map((v) => clean<SymbolName>({ symbol: v.symbol as string, name: str(v.name) }));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([symbol, name]) =>
      clean<SymbolName>({ symbol, name: str(name) }),
    );
  }
  return [];
}

export function parseRankedCompanies(value: unknown): RankedCompany[] {
  return asArray(value).map((c) => {
    const r = c as Record<string, unknown>;
    return clean<RankedCompany>({
      symbol: str(r.symbol) ?? "",
      name: str(r.name),
      ytdReturn: num(r.ytdReturn),
      lastPrice: num(r.lastPrice),
      targetPrice: num(r.targetPrice),
      growthEstimate: num(r.growthEstimate),
    });
  });
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
export function num(v: unknown): number | undefined {
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}
export function clean<T>(obj: Record<string, unknown>): T {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj as T;
}
