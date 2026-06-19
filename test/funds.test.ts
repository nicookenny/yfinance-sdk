import { describe, it, expect } from "vitest";
import { YahooClient } from "../src/core/client.js";
import { Ticker } from "../src/ticker/ticker.js";
import { DataError } from "../src/core/errors.js";
import { makeFakeFetch, type FakeResponseSpec } from "./helpers/fake-fetch.js";

const isAuth = (url: string) => {
  if (url.includes("getcrumb")) return true;
  const host = new URL(url).host;
  return host === "fc.yahoo.com" || host === "finance.yahoo.com";
};
const authReply = (url: string): FakeResponseSpec =>
  url.includes("getcrumb") ? { body: "CRUMB" } : { setCookies: ["A1=tok"] };

function clientReturning(module: Record<string, unknown>): YahooClient {
  const fetch = makeFakeFetch((url): FakeResponseSpec =>
    isAuth(url) ? authReply(url) : { json: { quoteSummary: { result: [module], error: null } } },
  );
  return new YahooClient({ fetch, minIntervalMs: 0, retries: 0, cacheEnabled: false });
}

describe("Ticker.fundsData", () => {
  it("reshapes holdings, weightings and operations", async () => {
    const client = clientReturning({
      quoteType: { quoteType: "ETF" },
      summaryProfile: { longBusinessSummary: "Tracks the S&P 500." },
      fundProfile: {
        categoryName: "Large Blend",
        family: "Vanguard",
        legalType: "Exchange Traded Fund",
        feesExpensesInvestment: { annualReportExpenseRatio: 0.0003 },
      },
      topHoldings: {
        cashPosition: 0.005,
        stockPosition: 0.99,
        bondPosition: 0,
        holdings: [
          { symbol: "AAPL", holdingName: "Apple Inc", holdingPercent: 0.07 },
          { symbol: "MSFT", holdingName: "Microsoft", holdingPercent: 0.065 },
        ],
        sectorWeightings: [{ technology: 0.3 }, { healthcare: 0.13 }],
        bondRatings: [{ aaa: 0.0 }],
        equityHoldings: { priceToEarnings: 22.5, priceToBook: 4.1 },
        bondHoldings: {},
      },
    });

    const funds = await new Ticker("VOO", client).fundsData();
    expect(funds.quoteType).toBe("ETF");
    expect(funds.description).toContain("S&P 500");
    expect(funds.fundOverview.family).toBe("Vanguard");
    expect(funds.fundOperations.annualReportExpenseRatio).toBeCloseTo(0.0003);
    expect(funds.assetClasses.stockPosition).toBe(0.99);
    expect(funds.topHoldings).toHaveLength(2);
    expect(funds.topHoldings[0]).toMatchObject({ symbol: "AAPL", holdingPercent: 0.07 });
    expect(funds.sectorWeightings).toEqual({ technology: 0.3, healthcare: 0.13 });
    expect(funds.equityHoldings.priceToEarnings).toBe(22.5);
  });

  it("rejects a non-fund symbol", async () => {
    const client = clientReturning({ quoteType: { quoteType: "EQUITY" } });
    await expect(new Ticker("AAPL", client).fundsData()).rejects.toBeInstanceOf(
      DataError,
    );
  });
});
