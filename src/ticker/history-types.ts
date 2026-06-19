/** Types for price history (the `/v8/finance/chart` endpoint). */

/** Predefined look-back ranges accepted by the chart API. */
export type Period =
  | "1d"
  | "5d"
  | "1mo"
  | "3mo"
  | "6mo"
  | "1y"
  | "2y"
  | "5y"
  | "10y"
  | "ytd"
  | "max";

/** Candle interval. Intraday intervals are only available for recent ranges. */
export type Interval =
  | "1m"
  | "2m"
  | "5m"
  | "15m"
  | "30m"
  | "60m"
  | "90m"
  | "1h"
  | "1d"
  | "5d"
  | "1wk"
  | "1mo"
  | "3mo";

/** A single OHLCV candle. Prices are `null` when Yahoo reports a gap. */
export interface HistoryRow {
  /** Candle timestamp (UTC). */
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  /** Adjusted close. Present unless `autoAdjust` folded it into `close`. */
  adjClose: number | null;
  volume: number | null;
  /** Dividend paid on this date (only when `actions` is enabled). */
  dividends?: number;
  /** Split ratio applied on this date, e.g. 4 for a 4:1 split. */
  stockSplits?: number;
}

/** A dividend event. */
export interface Dividend {
  date: Date;
  amount: number;
}

/** A stock-split event. */
export interface Split {
  date: Date;
  /** Shares received per share held (numerator / denominator). */
  ratio: number;
  numerator: number;
  denominator: number;
}

/** A dividend or split, tagged by type — the union yfinance calls "actions". */
export type CorporateAction =
  | { type: "dividend"; date: Date; amount: number }
  | { type: "split"; date: Date; ratio: number };

export interface HistoryOptions {
  /** Look-back range. Ignored when `start` is given. Default `"1mo"`. */
  period?: Period;
  /** Candle interval. Default `"1d"`. */
  interval?: Interval;
  /** Start of an explicit date range (Date, ms epoch, or `YYYY-MM-DD`). */
  start?: Date | number | string;
  /** End of an explicit date range (exclusive upper bound). */
  end?: Date | number | string;
  /** Include pre/post-market candles. Default `false`. */
  prepost?: boolean;
  /** Include dividend/split columns and events. Default `true`. */
  actions?: boolean;
  /** Adjust OHLC with the adjusted close and drop `adjClose`. Default `true`. */
  autoAdjust?: boolean;
  /** Keep rows where every OHLC value is null. Default `false`. */
  keepNa?: boolean;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/** Exchange/quote metadata returned alongside every chart response. */
export interface HistoryMeta {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  instrumentType?: string;
  timezone?: string;
  exchangeTimezoneName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  gmtOffset?: number;
}

/** Full result of a history fetch: rows plus the metadata block. */
export interface HistoryResult {
  symbol: string;
  meta: HistoryMeta;
  rows: HistoryRow[];
}
