/**
 * Fund/ETF data, mirroring yfinance's `FundsData`.
 *
 * Pulls the `quoteType`, `summaryProfile`, `topHoldings`, and `fundProfile`
 * modules and reshapes them into typed holdings, weightings, and operations.
 */
import type { YahooClient } from "../core/client.js";
import { DataError } from "../core/errors.js";
import { fetchQuoteSummary } from "../ticker/quote.js";

export interface FundOverview {
  categoryName?: string;
  family?: string;
  legalType?: string;
}

export interface FundOperations {
  annualReportExpenseRatio?: number;
  annualHoldingsTurnover?: number;
  totalNetAssets?: number;
}

export interface AssetClasses {
  cashPosition?: number;
  stockPosition?: number;
  bondPosition?: number;
  preferredPosition?: number;
  convertiblePosition?: number;
  otherPosition?: number;
}

export interface FundHolding {
  symbol: string;
  holdingName?: string;
  holdingPercent?: number;
}

export interface FundsData {
  symbol: string;
  quoteType?: string;
  description?: string;
  fundOverview: FundOverview;
  fundOperations: FundOperations;
  assetClasses: AssetClasses;
  topHoldings: FundHolding[];
  /** Sector → weight (e.g. `{ technology: 0.3 }`). */
  sectorWeightings: Record<string, number>;
  /** Bond credit rating → weight. */
  bondRatings: Record<string, number>;
  equityHoldings: Record<string, number>;
  bondHoldings: Record<string, number>;
}

const MODULES = ["quoteType", "summaryProfile", "topHoldings", "fundProfile"];

/** Fetches and reshapes fund data for a symbol. */
export async function fetchFundsData(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<FundsData> {
  const s = await fetchQuoteSummary(client, symbol, MODULES, signal);

  const quoteType = (s.quoteType ?? {}) as Record<string, unknown>;
  const qt = str(quoteType.quoteType);
  if (qt && qt !== "ETF" && qt !== "MUTUALFUND") {
    throw new DataError(`"${symbol}" is a ${qt}, not a fund or ETF`);
  }

  const profile = (s.summaryProfile ?? {}) as Record<string, unknown>;
  const fundProfile = (s.fundProfile ?? {}) as Record<string, unknown>;
  const top = (s.topHoldings ?? {}) as Record<string, unknown>;
  const fees = (fundProfile.feesExpensesInvestment ?? {}) as Record<string, unknown>;
  const description = str(profile.longBusinessSummary);

  return {
    symbol,
    ...(qt ? { quoteType: qt } : {}),
    ...(description !== undefined ? { description } : {}),
    fundOverview: clean<FundOverview>({
      categoryName: str(fundProfile.categoryName),
      family: str(fundProfile.family),
      legalType: str(fundProfile.legalType),
    }),
    fundOperations: clean<FundOperations>({
      annualReportExpenseRatio: num(fees.annualReportExpenseRatio),
      annualHoldingsTurnover: num(fees.annualHoldingsTurnover),
      totalNetAssets: num(fees.totalNetAssets),
    }),
    assetClasses: clean<AssetClasses>({
      cashPosition: num(top.cashPosition),
      stockPosition: num(top.stockPosition),
      bondPosition: num(top.bondPosition),
      preferredPosition: num(top.preferredPosition),
      convertiblePosition: num(top.convertiblePosition),
      otherPosition: num(top.otherPosition),
    }),
    topHoldings: asArray(top.holdings).map((h) => {
      const r = h as Record<string, unknown>;
      return clean<FundHolding>({
        symbol: str(r.symbol) ?? "",
        holdingName: str(r.holdingName),
        holdingPercent: num(r.holdingPercent),
      });
    }),
    sectorWeightings: weightMap(top.sectorWeightings),
    bondRatings: weightMap(top.bondRatings),
    equityHoldings: numericRecord(top.equityHoldings),
    bondHoldings: numericRecord(top.bondHoldings),
  };
}

/** Collapses `[{ technology: 0.3 }, { energy: 0.1 }]` into one record. */
function weightMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of asArray(value)) {
    for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
      const n = num(v);
      if (n !== undefined) out[k] = n;
    }
  }
  return out;
}

function numericRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const n = num(v);
      if (n !== undefined) out[k] = n;
    }
  }
  return out;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
