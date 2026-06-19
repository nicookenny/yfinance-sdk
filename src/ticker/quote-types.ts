/** Types for quote/profile data (the `/v10/finance/quoteSummary` endpoint). */

/** A per-module map: `{ price: {...}, summaryDetail: {...}, ... }`. */
export type QuoteSummary = Record<string, Record<string, unknown>>;

/**
 * Flattened company/quote info — the union of all requested modules merged into
 * one record, mirroring yfinance's `.info`. Typed fields cover the common keys;
 * the index signature keeps every other Yahoo field accessible.
 */
export interface Info {
  symbol?: string;
  shortName?: string;
  longName?: string;
  quoteType?: string;
  currency?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  website?: string;
  longBusinessSummary?: string;
  marketCap?: number;
  regularMarketPrice?: number;
  previousClose?: number;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  beta?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  [key: string]: unknown;
}

/** Lightweight, cheap-to-read snapshot derived from a few modules. */
export interface FastInfo {
  symbol?: string;
  currency?: string;
  exchange?: string;
  quoteType?: string;
  lastPrice?: number;
  previousClose?: number;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  marketCap?: number;
  shares?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  yearHigh?: number;
  yearLow?: number;
}

/** Upcoming earnings/dividend calendar. */
export interface Calendar {
  earningsDates: Date[];
  earningsHigh?: number;
  earningsLow?: number;
  earningsAverage?: number;
  revenueHigh?: number;
  revenueLow?: number;
  revenueAverage?: number;
  exDividendDate?: Date;
  dividendDate?: Date;
}

/** One row of the analyst recommendation trend. */
export interface RecommendationRow {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}
