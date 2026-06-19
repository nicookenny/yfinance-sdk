import { describe, it, expect } from "vitest";
import { YahooClient } from "../src/core/client.js";
import { Sector } from "../src/domain/sector.js";
import { Industry } from "../src/domain/industry.js";
import { Market } from "../src/domain/market.js";
import { makeFakeFetch, type FakeResponseSpec } from "./helpers/fake-fetch.js";

const isAuth = (url: string) => {
  if (url.includes("getcrumb")) return true;
  const host = new URL(url).host;
  return host === "fc.yahoo.com" || host === "finance.yahoo.com";
};
const authReply = (url: string): FakeResponseSpec =>
  url.includes("getcrumb") ? { body: "CRUMB" } : { setCookies: ["A1=tok"] };

function clientWith(handler: (url: string) => FakeResponseSpec) {
  const fetch = makeFakeFetch((url): FakeResponseSpec =>
    isAuth(url) ? authReply(url) : handler(url),
  );
  return {
    client: new YahooClient({ fetch, minIntervalMs: 0, retries: 0, cacheEnabled: false }),
    fetch,
  };
}

describe("Sector", () => {
  it("fetches and unwraps the sector profile", async () => {
    const { client, fetch } = clientWith(() => ({
      json: {
        data: {
          name: "Technology",
          symbol: "^YH311",
          overview: { companiesCount: { raw: 800, fmt: "800" }, marketCap: { raw: 1.2e13 } },
          topCompanies: [{ symbol: "AAPL", name: "Apple", marketWeight: { raw: 0.15 } }],
          topETFs: [{ symbol: "XLK", name: "Tech Select" }],
          topMutualFunds: { FSPTX: "Fidelity Select Tech" },
          industries: [{ key: "consumer-electronics", name: "Consumer Electronics", marketWeight: { raw: 0.2 } }],
        },
      },
    }));

    const sector = await new Sector("technology", client).fetch();
    expect(sector.name).toBe("Technology");
    expect(sector.overview.companiesCount).toBe(800);
    expect(sector.topCompanies[0]).toMatchObject({ symbol: "AAPL", marketWeight: 0.15 });
    expect(sector.topETFs[0]).toEqual({ symbol: "XLK", name: "Tech Select" });
    expect(sector.topMutualFunds[0]).toEqual({ symbol: "FSPTX", name: "Fidelity Select Tech" });
    expect(sector.industries[0]!.key).toBe("consumer-electronics");

    const call = fetch.calls.find((c) => c.url.includes("/sectors/technology"));
    expect(call?.url).toContain("crumb=CRUMB");
    expect(call?.url).toContain("withReturns=true");
  });
});

describe("Industry", () => {
  it("fetches sector linkage and ranked companies", async () => {
    const { client } = clientWith(() => ({
      json: {
        data: {
          name: "Consumer Electronics",
          sectorKey: "technology",
          sectorName: "Technology",
          overview: { companiesCount: { raw: 40 } },
          topPerformingCompanies: [
            { symbol: "AAPL", name: "Apple", ytdReturn: { raw: 0.3 }, lastPrice: { raw: 200 } },
          ],
          topGrowthCompanies: [
            { symbol: "SONY", growthEstimate: { raw: 0.12 } },
          ],
        },
      },
    }));

    const ind = await new Industry("consumer-electronics", client).fetch();
    expect(ind.sectorKey).toBe("technology");
    expect(ind.topPerformingCompanies[0]).toMatchObject({ symbol: "AAPL", ytdReturn: 0.3 });
    expect(ind.topGrowthCompanies[0]!.growthEstimate).toBeCloseTo(0.12);
  });
});

describe("Market", () => {
  it("returns parsed summary quotes", async () => {
    const { client } = clientWith(() => ({
      json: {
        marketSummaryResponse: {
          result: [
            {
              symbol: "^GSPC",
              shortName: "S&P 500",
              fullExchangeName: "SNP",
              regularMarketPrice: 4500,
              regularMarketChangePercent: 0.8,
            },
          ],
        },
      },
    }));
    const summary = await new Market("US", client).summary();
    expect(summary[0]).toMatchObject({
      symbol: "^GSPC",
      shortName: "S&P 500",
      regularMarketPrice: 4500,
      regularMarketChangePercent: 0.8,
    });
  });
});
