import { describe, it, expect } from "vitest";
import { YahooClient } from "../src/core/client.js";
import { download } from "../src/download.js";
import { Tickers } from "../src/tickers.js";
import { makeFakeFetch, type FakeResponseSpec } from "./helpers/fake-fetch.js";

const T0 = 1_700_000_000;

function chartJson(symbol: string, close: number): unknown {
  return {
    chart: {
      error: null,
      result: [
        {
          meta: { symbol, currency: "USD" },
          timestamp: [T0],
          indicators: {
            quote: [{ open: [close], high: [close], low: [close], close: [close], volume: [10] }],
            adjclose: [{ adjclose: [close] }],
          },
          events: {},
        },
      ],
    },
  };
}

/** Routes the chart request per symbol; MISSING returns a chart error. */
function multiClient(): YahooClient {
  const fetch = makeFakeFetch((url): FakeResponseSpec => {
    if (url.includes("/AAPL")) return { json: chartJson("AAPL", 100) };
    if (url.includes("/MSFT")) return { json: chartJson("MSFT", 200) };
    return { json: { chart: { result: null, error: { code: "Not Found" } } } };
  });
  return new YahooClient({ fetch, minIntervalMs: 0, retries: 0, cacheEnabled: false });
}

describe("download", () => {
  it("returns per-symbol data keyed by symbol", async () => {
    const result = await download(["aapl", "msft"], {
      client: multiClient(),
      autoAdjust: false,
    });
    expect(Object.keys(result.data).sort()).toEqual(["AAPL", "MSFT"]);
    expect(result.data.AAPL![0]!.close).toBe(100);
    expect(result.data.MSFT![0]!.close).toBe(200);
    expect(result.errors).toEqual({});
  });

  it("captures per-symbol errors without failing the batch", async () => {
    const result = await download(["AAPL", "MISSING"], {
      client: multiClient(),
      autoAdjust: false,
    });
    expect(Object.keys(result.data)).toEqual(["AAPL"]);
    expect(result.errors.MISSING).toBeDefined();
  });
});

describe("Tickers", () => {
  it("parses a string list and dedupes", () => {
    const t = new Tickers("AAPL MSFT, aapl");
    expect(t.symbols).toEqual(["AAPL", "MSFT"]);
    expect(Object.keys(t.tickers).sort()).toEqual(["AAPL", "MSFT"]);
  });

  it("downloads history for all symbols using its shared client", async () => {
    const t = new Tickers(["AAPL", "MSFT"], multiClient());
    const result = await t.download({ autoAdjust: false });
    expect(result.data.AAPL![0]!.close).toBe(100);
    expect(result.data.MSFT![0]!.close).toBe(200);
  });

  it("lazily creates a ticker on demand", () => {
    const t = new Tickers(["AAPL"]);
    const nflx = t.ticker("nflx");
    expect(nflx.symbol).toBe("NFLX");
    expect(t.symbols).toContain("NFLX");
  });
});
