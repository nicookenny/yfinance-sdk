/** Raw shape of the `/v8/finance/chart` JSON response (the parts we read). */

export interface ChartResponse {
  chart: {
    result: ChartResult[] | null;
    error: { code?: string; description?: string } | null;
  };
}

export interface ChartResult {
  meta?: ChartMeta;
  timestamp?: number[];
  indicators?: {
    quote?: ChartQuote[];
    adjclose?: Array<{ adjclose?: (number | null)[] }>;
  };
  events?: {
    dividends?: Record<string, { amount?: number; date?: number }>;
    splits?: Record<string, RawSplit>;
  };
}

export interface ChartMeta {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  instrumentType?: string;
  timezone?: string;
  exchangeTimezoneName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  gmtoffset?: number;
}

export interface ChartQuote {
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
  volume?: (number | null)[];
}

export interface RawSplit {
  date?: number;
  numerator?: number;
  denominator?: number;
  splitRatio?: string;
}
