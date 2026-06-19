/**
 * Financial statements via the `fundamentals-timeseries` endpoint.
 *
 * Yahoo returns one series per metric (e.g. `annualTotalRevenue`). We request a
 * curated key list, then pivot the column-oriented response into an array of
 * per-period rows: `{ date, TotalRevenue, NetIncome, … }`, newest last.
 */
import type { YahooClient } from "../core/client.js";
import { DataError, NotFoundError } from "../core/errors.js";
import { STATEMENT_KEYS, type StatementKind } from "./fundamentals-keys.js";

const TIMESERIES_BASE =
  "https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/";

/** Annual or quarterly reporting frequency. */
export type Frequency = "annual" | "quarterly";

/** A single reporting period: a date plus its metric values. */
export interface StatementRow {
  date: Date;
  [metric: string]: number | null | Date;
}

export interface StatementOptions {
  frequency?: Frequency;
  signal?: AbortSignal;
}

interface TimeseriesResponse {
  timeseries?: {
    result?: TimeseriesItem[] | null;
    error?: { code?: string; description?: string } | null;
  };
}

interface DataPoint {
  asOfDate?: string;
  reportedValue?: { raw?: number };
}

interface TimeseriesItem {
  meta?: { type?: string[] };
  timestamp?: number[];
  [seriesKey: string]:
    | Array<DataPoint | null>
    | { type?: string[] }
    | number[]
    | undefined;
}

/** Fetches one financial statement as an array of period rows. */
export async function fetchStatement(
  client: YahooClient,
  symbol: string,
  kind: StatementKind,
  options: StatementOptions = {},
): Promise<StatementRow[]> {
  const frequency = options.frequency ?? "annual";
  const keys = STATEMENT_KEYS[kind];
  const types = keys.map((k) => frequency + k);

  const url = TIMESERIES_BASE + encodeURIComponent(symbol);
  const json = await client.getJson<TimeseriesResponse>(url, {
    params: {
      symbol,
      type: types.join(","),
      // A wide window: from 2001 to "now" (Yahoo clamps to available data).
      period1: 978_307_200,
      period2: Math.floor(Date.now() / 1000),
      merge: false,
      padTimeSeries: true,
    },
    crumb: true,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const err = json.timeseries?.error;
  if (err) {
    throw new DataError(
      `timeseries error for "${symbol}": ${err.description ?? err.code ?? "unknown"}`,
    );
  }
  const result = json.timeseries?.result;
  if (!result) {
    throw new NotFoundError(`No fundamentals found for "${symbol}"`, { symbol });
  }

  return pivot(result, frequency);
}

/** Pivots Yahoo's per-metric series into per-date rows. */
function pivot(items: TimeseriesItem[], frequency: Frequency): StatementRow[] {
  const byDate = new Map<string, StatementRow>();

  for (const item of items) {
    const typeName = item.meta?.type?.[0];
    if (!typeName) continue;
    const metric = typeName.startsWith(frequency)
      ? typeName.slice(frequency.length)
      : typeName;

    const series = item[typeName];
    if (!Array.isArray(series)) continue;

    for (const point of series as Array<DataPoint | null>) {
      if (!point || !point.asOfDate) continue;
      const row = getRow(byDate, point.asOfDate);
      const raw = point.reportedValue?.raw;
      row[metric] = typeof raw === "number" ? raw : null;
    }
  }

  return [...byDate.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

function getRow(byDate: Map<string, StatementRow>, asOfDate: string): StatementRow {
  let row = byDate.get(asOfDate);
  if (!row) {
    row = { date: new Date(`${asOfDate}T00:00:00Z`) };
    byDate.set(asOfDate, row);
  }
  return row;
}
