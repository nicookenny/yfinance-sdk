import { describe, it, expect } from "vitest";
import { YahooClient } from "../../src/core/client.js";
import { search } from "../../src/search/search.js";
import { lookup } from "../../src/search/lookup.js";
import { screen } from "../../src/search/screener.js";
import { and, gt, eq, isin, btwn } from "../../src/search/query.js";
import { makeFakeFetch, type FakeResponseSpec } from "../helpers/fake-fetch.js";

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

describe("search", () => {
  it("returns quotes and news with parsed dates", async () => {
    const { client } = clientWith(() => ({
      json: {
        quotes: [
          { symbol: "AAPL", shortname: "Apple Inc.", quoteType: "EQUITY", score: 9 },
          { noSymbol: true },
        ],
        news: [
          { uuid: "1", title: "Apple soars", publisher: "Reuters", providerPublishTime: 1_700_000_000 },
        ],
      },
    }));
    const res = await search(client, "apple");
    expect(res.quotes).toHaveLength(1);
    expect(res.quotes[0]!.symbol).toBe("AAPL");
    expect(res.news[0]!.providerPublishTime).toEqual(new Date(1_700_000_000 * 1000));
  });
});

describe("lookup", () => {
  it("maps documents and sends the crumb", async () => {
    const { client, fetch } = clientWith(() => ({
      json: {
        finance: {
          result: [
            { documents: [{ symbol: "AAPL", shortName: "Apple", quoteType: "EQUITY" }] },
          ],
        },
      },
    }));
    const res = await lookup(client, "apple", { type: "equity" });
    expect(res[0]!.symbol).toBe("AAPL");
    const call = fetch.calls.find((c) => c.url.includes("/lookup"));
    expect(call?.url).toContain("type=equity");
    expect(call?.url).toContain("crumb=CRUMB");
  });
});

describe("screen", () => {
  it("runs a predefined screen via GET", async () => {
    const { client, fetch } = clientWith(() => ({
      json: { finance: { result: [{ quotes: [{ symbol: "TSLA" }], total: 1 }] } },
    }));
    const res = await screen(client, "day_gainers", { count: 10 });
    expect(res.quotes[0]!.symbol).toBe("TSLA");
    expect(res.total).toBe(1);
    const call = fetch.calls.find((c) => c.url.includes("/screener/predefined"));
    expect(call?.url).toContain("scrIds=day_gainers");
    expect(call?.init?.method ?? "GET").toBe("GET");
  });

  it("runs a custom query via POST with the built body", async () => {
    const { client, fetch } = clientWith(() => ({
      json: { finance: { result: [{ quotes: [{ symbol: "AAPL" }], total: 1 }] } },
    }));
    const query = and(gt("intradaymarketcap", 1e9), eq("region", "us"));
    const res = await screen(client, query, { count: 5, sortField: "dayvolume" });
    expect(res.quotes[0]!.symbol).toBe("AAPL");

    const call = fetch.calls.find(
      (c) => c.url.includes("/screener") && !c.url.includes("predefined"),
    );
    expect(call?.init?.method).toBe("POST");
    expect(call?.url).toContain("crumb=CRUMB");
    const body = JSON.parse(call!.init!.body as string);
    expect(body.size).toBe(5);
    expect(body.sortField).toBe("dayvolume");
    expect(body.query.operator).toBe("and");
    expect(body.query.operands[0]).toEqual({
      operator: "gt",
      operands: ["intradaymarketcap", 1e9],
    });
  });
});

describe("query builder", () => {
  it("builds comparison and logical nodes", () => {
    expect(gt("a", 1)).toEqual({ operator: "gt", operands: ["a", 1] });
    expect(btwn("a", 1, 2)).toEqual({ operator: "btwn", operands: ["a", 1, 2] });
    expect(isin("region", ["us", "ca"])).toEqual({
      operator: "or",
      operands: [
        { operator: "eq", operands: ["region", "us"] },
        { operator: "eq", operands: ["region", "ca"] },
      ],
    });
  });
});
