import { describe, it, expect } from "vitest";
import { YahooClient } from "../../src/core/client.js";
import { Ticker } from "../../src/ticker/ticker.js";
import { DataError, NotFoundError } from "../../src/core/errors.js";
import { makeFakeFetch, type FakeResponseSpec } from "../helpers/fake-fetch.js";

const isAuth = (url: string) => {
  if (url.includes("getcrumb")) return true;
  const host = new URL(url).host;
  return host === "fc.yahoo.com" || host === "finance.yahoo.com";
};
const authReply = (url: string): FakeResponseSpec =>
  url.includes("getcrumb") ? { body: "CRUMB" } : { setCookies: ["A1=tok"] };

function series(type: string, points: Array<[string, number | null]>) {
  return {
    meta: { type: [type] },
    [type]: points.map(([asOfDate, raw]) => ({
      asOfDate,
      reportedValue: raw === null ? {} : { raw },
    })),
  };
}

function clientReturning(result: unknown): YahooClient {
  const fetch = makeFakeFetch((url): FakeResponseSpec => {
    if (isAuth(url)) return authReply(url);
    return { json: { timeseries: { result, error: null } } };
  });
  return new YahooClient({ fetch, minIntervalMs: 0, retries: 0, cacheEnabled: false });
}

describe("Ticker.incomeStatement", () => {
  it("pivots per-metric series into per-date rows, sorted ascending", async () => {
    const client = clientReturning([
      series("annualTotalRevenue", [
        ["2022-09-30", 394_328_000_000],
        ["2023-09-30", 383_285_000_000],
      ]),
      series("annualNetIncome", [
        ["2022-09-30", 99_803_000_000],
        ["2023-09-30", 96_995_000_000],
      ]),
    ]);

    const rows = await new Ticker("AAPL", client).incomeStatement();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.date.toISOString().slice(0, 10)).toBe("2022-09-30");
    expect(rows[1]!.TotalRevenue).toBe(383_285_000_000);
    expect(rows[1]!.NetIncome).toBe(96_995_000_000);
  });

  it("requests annual types and sends the crumb", async () => {
    const fetch = makeFakeFetch((url): FakeResponseSpec => {
      if (isAuth(url)) return authReply(url);
      return { json: { timeseries: { result: [], error: null } } };
    });
    const client = new YahooClient({ fetch, minIntervalMs: 0, cacheEnabled: false });
    await new Ticker("AAPL", client).incomeStatement();
    const call = fetch.calls.find((c) => c.url.includes("timeseries"));
    expect(call?.url).toContain("type=annualTotalRevenue");
    expect(call?.url).toContain("crumb=CRUMB");
  });

  it("supports quarterly frequency", async () => {
    const fetch = makeFakeFetch((url): FakeResponseSpec => {
      if (isAuth(url)) return authReply(url);
      return { json: { timeseries: { result: [], error: null } } };
    });
    const client = new YahooClient({ fetch, minIntervalMs: 0, cacheEnabled: false });
    await new Ticker("AAPL", client).balanceSheet({ frequency: "quarterly" });
    const call = fetch.calls.find((c) => c.url.includes("timeseries"));
    expect(call?.url).toContain("type=quarterlyTotalAssets");
  });

  it("records null for missing reported values", async () => {
    const client = clientReturning([
      series("annualTotalRevenue", [["2023-09-30", null]]),
    ]);
    const rows = await new Ticker("AAPL", client).incomeStatement();
    expect(rows[0]!.TotalRevenue).toBeNull();
  });

  it("throws NotFoundError when result is absent", async () => {
    const client = clientReturning(null);
    await expect(
      new Ticker("NOPE", client).incomeStatement(),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws DataError on a timeseries error", async () => {
    const fetch = makeFakeFetch((url): FakeResponseSpec => {
      if (isAuth(url)) return authReply(url);
      return { json: { timeseries: { result: null, error: { code: "Bad", description: "nope" } } } };
    });
    const client = new YahooClient({ fetch, minIntervalMs: 0, retries: 0, cacheEnabled: false });
    await expect(
      new Ticker("AAPL", client).cashflow(),
    ).rejects.toBeInstanceOf(DataError);
  });
});
