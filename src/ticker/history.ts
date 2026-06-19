/**
 * Price history via Yahoo's chart endpoint (`/v8/finance/chart/{symbol}`).
 *
 * Turns the column-oriented chart payload into an array of typed {@link HistoryRow}
 * candles, optionally folding the adjusted close into OHLC (`autoAdjust`) and
 * aligning dividend/split events onto their rows (`actions`).
 *
 * The chart endpoint does not require a crumb, so history keeps working even
 * when Yahoo throttles the crumb endpoint.
 */
import type { YahooClient } from "../core/client.js";
import { DataError, NotFoundError } from "../core/errors.js";
import type { QueryParams } from "../core/types.js";
import type {
  ChartResponse,
  ChartResult,
} from "./chart-response.js";
import type {
  Dividend,
  HistoryMeta,
  HistoryOptions,
  HistoryResult,
  HistoryRow,
  Split,
} from "./history-types.js";

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

const VALID_PERIODS = new Set([
  "1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max",
]);
const VALID_INTERVALS = new Set([
  "1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo",
]);

/** Fetches the raw chart result for a symbol (shared by history and actions). */
export async function fetchChartResult(
  client: YahooClient,
  symbol: string,
  options: HistoryOptions = {},
): Promise<ChartResult> {
  const interval = options.interval ?? "1d";
  if (!VALID_INTERVALS.has(interval)) {
    throw new DataError(`Invalid interval "${interval}"`);
  }

  const params: QueryParams = {
    interval,
    includePrePost: options.prepost ?? false,
    events: "div,splits,capitalGains",
  };

  if (options.start !== undefined || options.end !== undefined) {
    params.period1 = toEpochSeconds(options.start) ?? 0;
    params.period2 =
      toEpochSeconds(options.end) ?? Math.floor(Date.now() / 1000);
  } else {
    const period = options.period ?? "1mo";
    if (!VALID_PERIODS.has(period)) {
      throw new DataError(`Invalid period "${period}"`);
    }
    params.range = period;
  }

  const url = CHART_BASE + encodeURIComponent(symbol);
  const json = await client.getJson<ChartResponse>(url, {
    params,
    crumb: false,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const err = json.chart?.error;
  if (err) {
    if (err.code === "Not Found") {
      throw new NotFoundError(`No data found for symbol "${symbol}"`, { symbol });
    }
    throw new DataError(
      `Chart error for "${symbol}": ${err.description ?? err.code ?? "unknown"}`,
    );
  }

  const result = json.chart?.result?.[0];
  if (!result) {
    throw new NotFoundError(`No data found for symbol "${symbol}"`, { symbol });
  }
  return result;
}

/** Fetches and parses price history for a single symbol. */
export async function fetchHistory(
  client: YahooClient,
  symbol: string,
  options: HistoryOptions = {},
): Promise<HistoryResult> {
  const result = await fetchChartResult(client, symbol, options);
  const rows = buildRows(result, {
    actions: options.actions ?? true,
    autoAdjust: options.autoAdjust ?? true,
    keepNa: options.keepNa ?? false,
  });
  return {
    symbol: result.meta?.symbol ?? symbol,
    meta: toMeta(result),
    rows,
  };
}

/** Extracts dividend events, sorted by date ascending. */
export function extractDividends(result: ChartResult): Dividend[] {
  const raw = result.events?.dividends ?? {};
  return Object.values(raw)
    .filter((d) => d.date !== undefined && d.amount !== undefined)
    .map((d) => ({ date: secondsToDate(d.date!), amount: d.amount! }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Extracts split events, sorted by date ascending. */
export function extractSplits(result: ChartResult): Split[] {
  const raw = result.events?.splits ?? {};
  return Object.values(raw)
    .filter((s) => s.date !== undefined)
    .map((s) => {
      const numerator = s.numerator ?? 1;
      const denominator = s.denominator || 1;
      return {
        date: secondsToDate(s.date!),
        numerator,
        denominator,
        ratio: numerator / denominator,
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function buildRows(
  result: ChartResult,
  opts: { actions: boolean; autoAdjust: boolean; keepNa: boolean },
): HistoryRow[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose ?? [];

  const rows: HistoryRow[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const open = at(quote.open, i);
    const high = at(quote.high, i);
    const low = at(quote.low, i);
    const close = at(quote.close, i);
    const volume = at(quote.volume, i);
    const adjClose = at(adj, i) ?? close;

    if (
      !opts.keepNa &&
      open === null &&
      high === null &&
      low === null &&
      close === null
    ) {
      continue;
    }

    const row: HistoryRow = {
      date: secondsToDate(timestamps[i]!),
      open,
      high,
      low,
      close,
      adjClose,
      volume,
    };

    if (opts.autoAdjust && close !== null && adjClose !== null && close !== 0) {
      const ratio = adjClose / close;
      row.open = scale(open, ratio);
      row.high = scale(high, ratio);
      row.low = scale(low, ratio);
      row.close = adjClose;
      row.adjClose = null;
    }

    rows.push(row);
  }

  if (opts.actions) attachActions(rows, timestamps, result);
  return rows;
}

/** Maps dividend/split events onto the row sharing their calendar day. */
function attachActions(
  rows: HistoryRow[],
  timestamps: number[],
  result: ChartResult,
): void {
  for (const row of rows) {
    row.dividends = 0;
    row.stockSplits = 0;
  }

  const indexByDay = new Map<string, number>();
  timestamps.forEach((ts, i) => {
    indexByDay.set(dayKey(secondsToDate(ts)), i);
  });
  // rows may be shorter than timestamps if NA rows were dropped; map by date.
  const rowByDay = new Map<string, HistoryRow>();
  for (const row of rows) rowByDay.set(dayKey(row.date), row);

  for (const div of extractDividends(result)) {
    const row = rowByDay.get(dayKey(div.date));
    if (row) row.dividends = (row.dividends ?? 0) + div.amount;
  }
  for (const split of extractSplits(result)) {
    const row = rowByDay.get(dayKey(split.date));
    if (row) row.stockSplits = split.ratio;
  }
}

function toMeta(result: ChartResult): HistoryMeta {
  const m = result.meta ?? {};
  return {
    ...(m.currency !== undefined ? { currency: m.currency } : {}),
    ...(m.symbol !== undefined ? { symbol: m.symbol } : {}),
    ...(m.exchangeName !== undefined ? { exchangeName: m.exchangeName } : {}),
    ...(m.instrumentType !== undefined ? { instrumentType: m.instrumentType } : {}),
    ...(m.timezone !== undefined ? { timezone: m.timezone } : {}),
    ...(m.exchangeTimezoneName !== undefined
      ? { exchangeTimezoneName: m.exchangeTimezoneName }
      : {}),
    ...(m.regularMarketPrice !== undefined
      ? { regularMarketPrice: m.regularMarketPrice }
      : {}),
    ...(m.chartPreviousClose !== undefined
      ? { chartPreviousClose: m.chartPreviousClose }
      : {}),
    ...(m.gmtoffset !== undefined ? { gmtOffset: m.gmtoffset } : {}),
  };
}

function at(arr: (number | null)[] | undefined, i: number): number | null {
  if (!arr) return null;
  const v = arr[i];
  return v === undefined || v === null || Number.isNaN(v) ? null : v;
}

function scale(value: number | null, ratio: number): number | null {
  return value === null ? null : value * ratio;
}

function secondsToDate(seconds: number): Date {
  return new Date(seconds * 1000);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Normalizes a Date/ms-epoch/`YYYY-MM-DD` value to epoch seconds. */
export function toEpochSeconds(
  value: Date | number | string | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === "number") {
    // Treat large numbers as ms, smaller as already-seconds.
    return value > 1e11 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new DataError(`Could not parse date "${value}"`);
  }
  return Math.floor(parsed / 1000);
}
