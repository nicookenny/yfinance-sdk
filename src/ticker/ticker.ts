/**
 * `Ticker` — the primary user-facing facade, mirroring yfinance's `Ticker`.
 *
 * Construct it with a symbol (and optionally a shared {@link YahooClient}) and
 * call typed methods for each data family. Step 1 covers price history and
 * corporate actions; later steps add quote/info, financials, holders, options,
 * and more onto this same class.
 */
import { YahooClient } from "../core/client.js";
import {
  extractDividends,
  extractSplits,
  fetchChartResult,
  fetchHistory,
} from "./history.js";
import type {
  CorporateAction,
  Dividend,
  HistoryOptions,
  HistoryResult,
  HistoryRow,
  Split,
} from "./history-types.js";
import {
  fetchCalendar,
  fetchFastInfo,
  fetchInfo,
  fetchQuoteSummary,
  fetchRecommendations,
} from "./quote.js";
import type {
  Calendar,
  FastInfo,
  Info,
  QuoteSummary,
  RecommendationRow,
} from "./quote-types.js";

export class Ticker {
  readonly symbol: string;
  private readonly client: YahooClient;

  constructor(symbol: string, client?: YahooClient) {
    if (!symbol || !symbol.trim()) {
      throw new Error("Ticker requires a non-empty symbol");
    }
    this.symbol = symbol.trim().toUpperCase();
    this.client = client ?? new YahooClient();
  }

  /** Underlying HTTP client (shareable across tickers). */
  get http(): YahooClient {
    return this.client;
  }

  /** Price history as an array of candles. */
  async history(options?: HistoryOptions): Promise<HistoryRow[]> {
    const result = await fetchHistory(this.client, this.symbol, options);
    return result.rows;
  }

  /** Price history with the accompanying exchange metadata. */
  async historyResult(options?: HistoryOptions): Promise<HistoryResult> {
    return fetchHistory(this.client, this.symbol, options);
  }

  /** All dividends over the maximum available range. */
  async dividends(options?: Pick<HistoryOptions, "signal">): Promise<Dividend[]> {
    const result = await fetchChartResult(this.client, this.symbol, {
      period: "max",
      interval: "1d",
      ...options,
    });
    return extractDividends(result);
  }

  /** All stock splits over the maximum available range. */
  async splits(options?: Pick<HistoryOptions, "signal">): Promise<Split[]> {
    const result = await fetchChartResult(this.client, this.symbol, {
      period: "max",
      interval: "1d",
      ...options,
    });
    return extractSplits(result);
  }

  /** Dividends and splits merged into one chronologically sorted list. */
  async actions(
    options?: Pick<HistoryOptions, "signal">,
  ): Promise<CorporateAction[]> {
    const result = await fetchChartResult(this.client, this.symbol, {
      period: "max",
      interval: "1d",
      ...options,
    });
    const merged: CorporateAction[] = [
      ...extractDividends(result).map(
        (d): CorporateAction => ({ type: "dividend", date: d.date, amount: d.amount }),
      ),
      ...extractSplits(result).map(
        (s): CorporateAction => ({ type: "split", date: s.date, ratio: s.ratio }),
      ),
    ];
    return merged.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /** Flattened company/quote info (yfinance `.info`). */
  async info(options?: { signal?: AbortSignal }): Promise<Info> {
    return fetchInfo(this.client, this.symbol, options?.signal);
  }

  /** Lightweight price/size snapshot (yfinance `.fast_info`). */
  async fastInfo(options?: { signal?: AbortSignal }): Promise<FastInfo> {
    return fetchFastInfo(this.client, this.symbol, options?.signal);
  }

  /** Raw `quoteSummary` modules, unwrapped. Defaults to the info module set. */
  async quoteSummary(
    modules?: readonly string[],
    options?: { signal?: AbortSignal },
  ): Promise<QuoteSummary> {
    const mods = modules ?? [
      "assetProfile",
      "summaryProfile",
      "summaryDetail",
      "quoteType",
      "defaultKeyStatistics",
      "price",
      "financialData",
    ];
    return fetchQuoteSummary(this.client, this.symbol, mods, options?.signal);
  }

  /** Upcoming earnings/dividend calendar. */
  async calendar(options?: { signal?: AbortSignal }): Promise<Calendar> {
    return fetchCalendar(this.client, this.symbol, options?.signal);
  }

  /** Analyst recommendation trend, one row per period. */
  async recommendations(
    options?: { signal?: AbortSignal },
  ): Promise<RecommendationRow[]> {
    return fetchRecommendations(this.client, this.symbol, options?.signal);
  }
}
