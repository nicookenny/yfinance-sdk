/**
 * Bulk history download across many symbols — yfinance's `download()`.
 *
 * Requests share a single {@link YahooClient}, so the client's rate limiter
 * spaces them automatically. A failure on one symbol is captured in `errors`
 * rather than rejecting the whole batch.
 */
import { YahooClient } from "./core/client.js";
import { fetchHistory } from "./ticker/history.js";
import type { HistoryOptions, HistoryRow } from "./ticker/history-types.js";

export interface DownloadOptions extends HistoryOptions {
  /** Reuse an existing client (recommended for repeated calls). */
  client?: YahooClient;
}

export interface DownloadResult {
  /** Per-symbol candles, keyed by the normalized (upper-cased) symbol. */
  data: Record<string, HistoryRow[]>;
  /** Per-symbol error messages for symbols that failed. */
  errors: Record<string, string>;
}

/** Downloads price history for many symbols concurrently. */
export async function download(
  symbols: string[],
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const { client: provided, ...historyOptions } = options;
  const client = provided ?? new YahooClient();

  const normalized = symbols
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);

  const data: Record<string, HistoryRow[]> = {};
  const errors: Record<string, string> = {};

  const settled = await Promise.allSettled(
    normalized.map((symbol) => fetchHistory(client, symbol, historyOptions)),
  );

  settled.forEach((outcome, i) => {
    const symbol = normalized[i]!;
    if (outcome.status === "fulfilled") {
      data[symbol] = outcome.value.rows;
    } else {
      errors[symbol] =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);
    }
  });

  return { data, errors };
}
