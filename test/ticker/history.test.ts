import { describe, it, expect } from "vitest";
import { YahooClient } from "../../src/core/client.js";
import { Ticker } from "../../src/ticker/ticker.js";
import { fetchHistory, toEpochSeconds } from "../../src/ticker/history.js";
import { DataError, NotFoundError } from "../../src/core/errors.js";
import { makeFakeFetch, type FakeResponseSpec } from "../helpers/fake-fetch.js";

// 2023-11-14 and 2023-11-15 (UTC days).
const T0 = 1_700_000_000;
const T1 = 1_700_086_400;

interface ChartOverrides {
  timestamp?: number[];
  quote?: Record<string, (number | null)[]>;
  adjclose?: (number | null)[];
  dividends?: Record<string, { amount: number; date: number }>;
  splits?: Record<string, { date: number; numerator: number; denominator: number }>;
  error?: { code: string; description?: string } | null;
  result?: unknown[] | null;
}

function chartJson(o: ChartOverrides = {}): unknown {
  if (o.error !== undefined || o.result !== undefined) {
    return { chart: { error: o.error ?? null, result: o.result ?? null } };
  }
  return {
    chart: {
      error: null,
      result: [
        {
          meta: { symbol: "AAPL", currency: "USD", exchangeName: "NMS", regularMarketPrice: 200 },
          timestamp: o.timestamp ?? [T0, T1],
          indicators: {
            quote: [
              o.quote ?? {
                open: [10, 20],
                high: [11, 22],
                low: [9, 18],
                close: [10, 20],
                volume: [100, 200],
              },
            ],
            adjclose: [{ adjclose: o.adjclose ?? [10, 20] }],
          },
          events: {
            ...(o.dividends ? { dividends: o.dividends } : {}),
            ...(o.splits ? { splits: o.splits } : {}),
          },
        },
      ],
    },
  };
}

function clientFor(json: unknown): YahooClient {
  const fetch = makeFakeFetch((): FakeResponseSpec => ({ json }));
  return new YahooClient({ fetch, minIntervalMs: 0, retries: 0, cacheEnabled: false });
}

describe("fetchHistory", () => {
  it("parses OHLCV rows", async () => {
    const client = clientFor(chartJson({ adjclose: [10, 20] }));
    const { rows, meta } = await fetchHistory(client, "AAPL", { autoAdjust: false });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ open: 10, high: 11, low: 9, close: 10, volume: 100 });
    expect(rows[0]!.date.toISOString().slice(0, 10)).toBe("2023-11-14");
    expect(meta.currency).toBe("USD");
  });

  it("keeps adjClose when autoAdjust is off", async () => {
    const client = clientFor(chartJson({ adjclose: [5, 20] }));
    const { rows } = await fetchHistory(client, "AAPL", { autoAdjust: false });
    expect(rows[0]!.close).toBe(10);
    expect(rows[0]!.adjClose).toBe(5);
  });

  it("folds adjClose into OHLC when autoAdjust is on", async () => {
    const client = clientFor(chartJson({ adjclose: [5, 20] }));
    const { rows } = await fetchHistory(client, "AAPL", { autoAdjust: true });
    // ratio = 5/10 = 0.5 on the first row
    expect(rows[0]!.open).toBe(5);
    expect(rows[0]!.high).toBeCloseTo(5.5);
    expect(rows[0]!.low).toBeCloseTo(4.5);
    expect(rows[0]!.close).toBe(5);
    expect(rows[0]!.adjClose).toBeNull();
  });

  it("drops fully-null rows unless keepNa", async () => {
    const quote = {
      open: [null, 20],
      high: [null, 22],
      low: [null, 18],
      close: [null, 20],
      volume: [null, 200],
    };
    const dropped = await fetchHistory(clientFor(chartJson({ quote })), "AAPL", {});
    expect(dropped.rows).toHaveLength(1);

    const kept = await fetchHistory(clientFor(chartJson({ quote })), "AAPL", {
      keepNa: true,
    });
    expect(kept.rows).toHaveLength(2);
    expect(kept.rows[0]!.open).toBeNull();
  });

  it("aligns dividends and splits onto their rows", async () => {
    const client = clientFor(
      chartJson({
        adjclose: [10, 20],
        dividends: { "1700086400": { amount: 0.24, date: T1 } },
        splits: { "1700000000": { date: T0, numerator: 4, denominator: 1 } },
      }),
    );
    const { rows } = await fetchHistory(client, "AAPL", { actions: true, autoAdjust: false });
    expect(rows[0]!.stockSplits).toBe(4);
    expect(rows[0]!.dividends).toBe(0);
    expect(rows[1]!.dividends).toBeCloseTo(0.24);
  });

  it("builds a range param for a period", async () => {
    const fetch = makeFakeFetch((): FakeResponseSpec => ({ json: chartJson() }));
    const client = new YahooClient({ fetch, minIntervalMs: 0, cacheEnabled: false });
    await fetchHistory(client, "AAPL", { period: "5d" });
    expect(fetch.calls[0]!.url).toContain("range=5d");
  });

  it("builds period1/period2 for an explicit date range", async () => {
    const fetch = makeFakeFetch((): FakeResponseSpec => ({ json: chartJson() }));
    const client = new YahooClient({ fetch, minIntervalMs: 0, cacheEnabled: false });
    await fetchHistory(client, "AAPL", { start: "2023-01-01", end: "2023-02-01" });
    const url = fetch.calls[0]!.url;
    expect(url).toContain("period1=");
    expect(url).toContain("period2=");
    expect(url).not.toContain("range=");
  });

  it("rejects invalid interval and period", async () => {
    const client = clientFor(chartJson());
    await expect(
      // @ts-expect-error testing runtime guard
      fetchHistory(client, "AAPL", { interval: "7m" }),
    ).rejects.toBeInstanceOf(DataError);
    await expect(
      // @ts-expect-error testing runtime guard
      fetchHistory(client, "AAPL", { period: "100y" }),
    ).rejects.toBeInstanceOf(DataError);
  });

  it("throws NotFoundError on a chart error", async () => {
    const client = clientFor(chartJson({ error: { code: "Not Found" } }));
    await expect(fetchHistory(client, "NOPE", {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError on an empty result", async () => {
    const client = clientFor(chartJson({ result: [] }));
    await expect(fetchHistory(client, "NOPE", {})).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("toEpochSeconds", () => {
  it("handles Date, ms, seconds and strings", () => {
    expect(toEpochSeconds(new Date("2023-01-01T00:00:00Z"))).toBe(1_672_531_200);
    expect(toEpochSeconds(1_672_531_200_000)).toBe(1_672_531_200);
    expect(toEpochSeconds(1_672_531_200)).toBe(1_672_531_200);
    expect(toEpochSeconds("2023-01-01")).toBe(1_672_531_200);
    expect(toEpochSeconds(undefined)).toBeUndefined();
  });

  it("throws on an unparseable string", () => {
    expect(() => toEpochSeconds("not-a-date")).toThrow(DataError);
  });
});

describe("Ticker", () => {
  it("normalizes the symbol and exposes history", async () => {
    const client = clientFor(chartJson());
    const t = new Ticker(" aapl ", client);
    expect(t.symbol).toBe("AAPL");
    const rows = await t.history({ autoAdjust: false });
    expect(rows).toHaveLength(2);
  });

  it("returns dividends, splits and merged actions", async () => {
    const client = clientFor(
      chartJson({
        dividends: { "1700086400": { amount: 0.24, date: T1 } },
        splits: { "1700000000": { date: T0, numerator: 4, denominator: 1 } },
      }),
    );
    const t = new Ticker("AAPL", client);
    expect(await t.dividends()).toEqual([{ date: new Date(T1 * 1000), amount: 0.24 }]);
    expect((await t.splits())[0]).toMatchObject({ ratio: 4, numerator: 4, denominator: 1 });
    const actions = await t.actions();
    expect(actions.map((a) => a.type)).toEqual(["split", "dividend"]);
  });

  it("rejects an empty symbol", () => {
    expect(() => new Ticker("   ")).toThrow();
  });
});
