import { describe, it, expect } from "vitest";
import { YahooClient } from "../../src/core/client.js";
import { Ticker } from "../../src/ticker/ticker.js";
import { makeFakeFetch, type FakeResponseSpec } from "../helpers/fake-fetch.js";

const isAuth = (url: string) => {
  if (url.includes("getcrumb")) return true;
  const host = new URL(url).host;
  return host === "fc.yahoo.com" || host === "finance.yahoo.com";
};
const authReply = (url: string): FakeResponseSpec =>
  url.includes("getcrumb") ? { body: "CRUMB" } : { setCookies: ["A1=tok"] };

function clientReturning(module: Record<string, unknown>): YahooClient {
  const fetch = makeFakeFetch((url): FakeResponseSpec => {
    if (isAuth(url)) return authReply(url);
    return { json: { quoteSummary: { result: [module], error: null } } };
  });
  return new YahooClient({ fetch, minIntervalMs: 0, retries: 0, cacheEnabled: false });
}

describe("holders", () => {
  it("reads aggregate major holders", async () => {
    const client = clientReturning({
      majorHoldersBreakdown: {
        insidersPercentHeld: 0.0007,
        institutionsPercentHeld: 0.61,
        institutionsCount: 5300,
      },
    });
    const mh = await new Ticker("AAPL", client).majorHolders();
    expect(mh.institutionsPercentHeld).toBeCloseTo(0.61);
    expect(mh.institutionsCount).toBe(5300);
  });

  it("maps institutional holders with dates", async () => {
    const client = clientReturning({
      institutionOwnership: {
        ownershipList: [
          {
            organization: "Vanguard Group Inc",
            reportDate: 1_700_000_000,
            pctHeld: 0.084,
            position: 1_300_000_000,
            value: 250_000_000_000,
          },
        ],
      },
    });
    const holders = await new Ticker("AAPL", client).institutionalHolders();
    expect(holders).toHaveLength(1);
    expect(holders[0]!.organization).toBe("Vanguard Group Inc");
    expect(holders[0]!.reportDate).toEqual(new Date(1_700_000_000 * 1000));
    expect(holders[0]!.pctHeld).toBeCloseTo(0.084);
  });

  it("maps insider transactions", async () => {
    const client = clientReturning({
      insiderTransactions: {
        transactions: [
          {
            filerName: "COOK TIMOTHY D",
            transactionText: "Sale",
            startDate: 1_690_000_000,
            shares: 50_000,
            value: 9_000_000,
            ownership: "D",
          },
        ],
      },
    });
    const tx = await new Ticker("AAPL", client).insiderTransactions();
    expect(tx[0]!.filerName).toBe("COOK TIMOTHY D");
    expect(tx[0]!.startDate).toEqual(new Date(1_690_000_000 * 1000));
    expect(tx[0]!.shares).toBe(50_000);
  });

  it("returns an empty array when a holder list is missing", async () => {
    const client = clientReturning({ fundOwnership: {} });
    expect(await new Ticker("AAPL", client).mutualFundHolders()).toEqual([]);
  });
});

describe("analysis", () => {
  it("reads analyst price targets", async () => {
    const client = clientReturning({
      financialData: {
        currentPrice: 200,
        targetHighPrice: 260,
        targetLowPrice: 150,
        targetMeanPrice: 220,
        numberOfAnalystOpinions: 40,
        recommendationKey: "buy",
      },
    });
    const pt = await new Ticker("AAPL", client).analystPriceTargets();
    expect(pt).toMatchObject({
      current: 200,
      high: 260,
      low: 150,
      mean: 220,
      numberOfAnalysts: 40,
      recommendationKey: "buy",
    });
  });

  it("reads earnings and revenue estimates per period", async () => {
    const client = clientReturning({
      earningsTrend: {
        trend: [
          {
            period: "0q",
            earningsEstimate: { avg: 1.5, low: 1.4, high: 1.6, numberOfAnalysts: 28 },
            revenueEstimate: { avg: 89_000_000_000, numberOfAnalysts: 25 },
            epsTrend: { current: 1.5, "7daysAgo": 1.48, "30daysAgo": 1.45 },
          },
        ],
      },
    });
    const t = new Ticker("AAPL", client);
    const eps = await t.earningsEstimate();
    expect(eps[0]).toMatchObject({ period: "0q", avg: 1.5, numberOfAnalysts: 28 });
    const rev = await t.revenueEstimate();
    expect(rev[0]!.avg).toBe(89_000_000_000);
    const trend = await t.epsTrend();
    expect(trend[0]).toMatchObject({ period: "0q", current: 1.5, days7Ago: 1.48, days30Ago: 1.45 });
  });
});
