/**
 * `Tickers` — a container managing many {@link Ticker}s that share one client,
 * mirroring yfinance's `Tickers`.
 */
import { YahooClient } from "./core/client.js";
import { Ticker } from "./ticker/ticker.js";
import { download, type DownloadOptions, type DownloadResult } from "./download.js";

export class Tickers {
  readonly symbols: string[];
  readonly tickers: Record<string, Ticker>;
  private readonly client: YahooClient;

  constructor(symbols: string[] | string, client?: YahooClient) {
    const list = (Array.isArray(symbols) ? symbols : symbols.split(/[\s,]+/))
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    this.client = client ?? new YahooClient();
    this.symbols = [...new Set(list)];
    this.tickers = {};
    for (const symbol of this.symbols) {
      this.tickers[symbol] = new Ticker(symbol, this.client);
    }
  }

  /** Returns the {@link Ticker} for `symbol`, creating it if needed. */
  ticker(symbol: string): Ticker {
    const key = symbol.trim().toUpperCase();
    const existing = this.tickers[key];
    if (existing) return existing;
    const created = new Ticker(key, this.client);
    this.tickers[key] = created;
    if (!this.symbols.includes(key)) this.symbols.push(key);
    return created;
  }

  /** Bulk-downloads history for all contained symbols. */
  async download(
    options?: Omit<DownloadOptions, "client">,
  ): Promise<DownloadResult> {
    return download(this.symbols, { ...options, client: this.client });
  }
}
