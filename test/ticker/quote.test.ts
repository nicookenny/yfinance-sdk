import { describe, it, expect } from "vitest";
import { YahooClient } from "../../src/core/client.js";
import { Ticker } from "../../src/ticker/ticker.js";
import { unwrap } from "../../src/ticker/quote.js";
import { NotFoundError } from "../../src/core/errors.js";
import { makeFakeFetch, type FakeResponseSpec } from "../helpers/fake-fetch.js";

const isAuth = (url: string) => {
  if (url.includes("getcrumb")) return true;
  const host = new URL(url).host;
  return host === "fc.yahoo.com" || host === "finance.yahoo.com";
};
const authReply = (url: string): FakeResponseSpec =>
  url.includes("getcrumb") ? { body: "CRUMB" } : { setCookies: ["A1=tok"] };

function clientReturning(result: Record<string, unknown> | null): YahooClient {
  const fetch = makeFakeFetch((url): FakeResponseSpec => {
    if (isAuth(url)) return authReply(url);
    return {
      json: {
        quoteSummary: { result: result ? [result] : null, error: null },
      },
    };
  });
  return new YahooClient({ fetch, minIntervalMs: 0, retries: 0, cacheEnabled: false });
}

describe("unwrap", () => {
  it("collapses {raw,fmt} wrappers", () => {
    expect(unwrap({ raw: 42, fmt: "42.00" })).toBe(42);
    expect(unwrap({ raw: 1, fmt: "1", longFmt: "1" })).toBe(1);
  });

  it("recurses into nested objects and arrays", () => {
    const input = {
      a: { raw: 5, fmt: "5" },
      b: { nested: { raw: 7, fmt: "7" }, name: "x" },
      c: [{ raw: 1, fmt: "1" }, { raw: 2, fmt: "2" }],
    };
    expect(unwrap(input)).toEqual({
      a: 5,
      b: { nested: 7, name: "x" },
      c: [1, 2],
    });
  });

  it("leaves objects without a raw key intact", () => {
    expect(unwrap({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });
});

describe("Ticker.info", () => {
  it("flattens all modules into one record", async () => {
    const client = clientReturning({
      price: { symbol: "AAPL", regularMarketPrice: 200, currency: "USD" },
      summaryDetail: { previousClose: 198, trailingPE: 30 },
      assetProfile: { sector: "Technology", industry: "Consumer Electronics" },
    });
    const info = await new Ticker("AAPL", client).info();
    expect(info.symbol).toBe("AAPL");
    expect(info.regularMarketPrice).toBe(200);
    expect(info.previousClose).toBe(198);
    expect(info.sector).toBe("Technology");
  });

  it("throws NotFoundError when result is empty", async () => {
    const client = clientReturning(null);
    await expect(new Ticker("NOPE", client).info()).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("Ticker.fastInfo", () => {
  it("derives a lightweight snapshot", async () => {
    const client = clientReturning({
      price: {
        symbol: "AAPL",
        currency: "USD",
        exchangeName: "NMS",
        quoteType: "EQUITY",
        regularMarketPrice: 200,
        marketCap: 3_000_000,
      },
      summaryDetail: {
        previousClose: 198,
        dayHigh: 205,
        dayLow: 197,
        fiftyTwoWeekHigh: 250,
        fiftyTwoWeekLow: 150,
      },
      defaultKeyStatistics: { sharesOutstanding: 15_000 },
    });
    const fast = await new Ticker("AAPL", client).fastInfo();
    expect(fast).toMatchObject({
      symbol: "AAPL",
      currency: "USD",
      lastPrice: 200,
      previousClose: 198,
      marketCap: 3_000_000,
      shares: 15_000,
      yearHigh: 250,
      yearLow: 150,
    });
  });
});

describe("Ticker.calendar", () => {
  it("parses earnings and dividend dates", async () => {
    const client = clientReturning({
      calendarEvents: {
        earnings: {
          earningsDate: [1_700_000_000],
          earningsAverage: 1.5,
          revenueAverage: 1000,
        },
        exDividendDate: 1_699_000_000,
        dividendDate: 1_701_000_000,
      },
    });
    const cal = await new Ticker("AAPL", client).calendar();
    expect(cal.earningsDates).toHaveLength(1);
    expect(cal.earningsDates[0]).toEqual(new Date(1_700_000_000 * 1000));
    expect(cal.earningsAverage).toBe(1.5);
    expect(cal.exDividendDate).toEqual(new Date(1_699_000_000 * 1000));
  });
});

describe("Ticker.recommendations", () => {
  it("parses the recommendation trend", async () => {
    const client = clientReturning({
      recommendationTrend: {
        trend: [
          { period: "0m", strongBuy: 5, buy: 10, hold: 3, sell: 1, strongSell: 0 },
          { period: "-1m", strongBuy: 4, buy: 9, hold: 4 },
        ],
      },
    });
    const recs = await new Ticker("AAPL", client).recommendations();
    expect(recs).toHaveLength(2);
    expect(recs[0]).toEqual({
      period: "0m",
      strongBuy: 5,
      buy: 10,
      hold: 3,
      sell: 1,
      strongSell: 0,
    });
    // Missing fields default to 0.
    expect(recs[1]!.sell).toBe(0);
  });
});

describe("Ticker.quoteSummary", () => {
  it("returns unwrapped modules and sends the crumb", async () => {
    const fetch = makeFakeFetch((url): FakeResponseSpec => {
      if (isAuth(url)) return authReply(url);
      return {
        json: {
          quoteSummary: {
            result: [{ price: { marketCap: { raw: 100, fmt: "100" } } }],
            error: null,
          },
        },
      };
    });
    const client = new YahooClient({ fetch, minIntervalMs: 0, cacheEnabled: false });
    const summary = await new Ticker("AAPL", client).quoteSummary(["price"]);
    expect(summary.price!.marketCap).toBe(100);
    const dataCall = fetch.calls.find((c) => c.url.includes("quoteSummary"));
    expect(dataCall?.url).toContain("crumb=CRUMB");
    expect(dataCall?.url).toContain("modules=price");
  });
});
