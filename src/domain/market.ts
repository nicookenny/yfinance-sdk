/**
 * `Market` — market summary and status.
 *
 * `summary()` returns the index/quote summaries for a region; `status()` reads
 * the market clock. Note: Yahoo's markettime endpoint silently ignores the
 * `market` param and always returns U.S. data, so status is only reliable for US.
 */
import { YahooClient } from "../core/client.js";
import { unwrap } from "../ticker/quote.js";
import type { MarketSummaryQuote } from "./types.js";

const SUMMARY_URL =
  "https://query1.finance.yahoo.com/v6/finance/quote/marketSummary";
const STATUS_URL = "https://query1.finance.yahoo.com/v6/finance/markettime";

interface SummaryResponse {
  marketSummaryResponse?: { result?: Array<Record<string, unknown>> };
}

export class Market {
  private readonly client: YahooClient;
  readonly region: string;

  constructor(region = "US", client?: YahooClient) {
    this.region = region;
    this.client = client ?? new YahooClient();
  }

  /** Index/quote summaries for the region. */
  async summary(signal?: AbortSignal): Promise<MarketSummaryQuote[]> {
    const json = await this.client.getJson<SummaryResponse>(SUMMARY_URL, {
      params: {
        fields:
          "shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent",
        formatted: false,
        lang: "en-US",
        market: this.region,
      },
      crumb: true,
      ...(signal ? { signal } : {}),
    });

    const results = json.marketSummaryResponse?.result ?? [];
    return results
      .filter((r) => typeof r.symbol === "string")
      .map((r): MarketSummaryQuote => {
        const u = unwrap(r) as Record<string, unknown>;
        return clean<MarketSummaryQuote>({
          symbol: u.symbol as string,
          shortName: str(u.shortName),
          fullExchangeName: str(u.fullExchangeName),
          regularMarketPrice: num(u.regularMarketPrice),
          regularMarketChange: num(u.regularMarketChange),
          regularMarketChangePercent: num(u.regularMarketChangePercent),
        });
      });
  }

  /** Raw market-clock status (shape varies by region; returned unwrapped). */
  async status(signal?: AbortSignal): Promise<Record<string, unknown>> {
    const json = await this.client.getJson<Record<string, unknown>>(STATUS_URL, {
      params: { formatted: true, key: "finance", lang: "en-US", market: this.region },
      crumb: true,
      ...(signal ? { signal } : {}),
    });
    return unwrap(json) as Record<string, unknown>;
  }
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
