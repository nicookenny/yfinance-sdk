import { describe, it, expect } from "vitest";
import { YahooClient } from "../../src/core/client.js";
import { Ticker } from "../../src/ticker/ticker.js";
import { NotFoundError } from "../../src/core/errors.js";
import { makeFakeFetch, type FakeResponseSpec } from "../helpers/fake-fetch.js";

const isAuth = (url: string) => {
  if (url.includes("getcrumb")) return true;
  const host = new URL(url).host;
  return host === "fc.yahoo.com" || host === "finance.yahoo.com";
};
const authReply = (url: string): FakeResponseSpec =>
  url.includes("getcrumb") ? { body: "CRUMB" } : { setCookies: ["A1=tok"] };

const EXP1 = 1_700_000_000;
const EXP2 = 1_702_000_000;

function optionsJson(): unknown {
  return {
    optionChain: {
      error: null,
      result: [
        {
          underlyingSymbol: "AAPL",
          expirationDates: [EXP1, EXP2],
          strikes: [190, 200, 210],
          options: [
            {
              expirationDate: EXP1,
              calls: [
                {
                  contractSymbol: "AAPL231114C00200000",
                  strike: 200,
                  currency: "USD",
                  lastPrice: 5.5,
                  volume: 1200,
                  openInterest: 5000,
                  bid: 5.4,
                  ask: 5.6,
                  contractSize: "REGULAR",
                  expiration: EXP1,
                  lastTradeDate: 1_699_900_000,
                  impliedVolatility: 0.31,
                  inTheMoney: true,
                },
              ],
              puts: [
                { contractSymbol: "AAPL231114P00190000", strike: 190, lastPrice: 2.1, inTheMoney: false },
              ],
            },
          ],
        },
      ],
    },
  };
}

function client(json: unknown = optionsJson()): YahooClient {
  const fetch = makeFakeFetch((url): FakeResponseSpec =>
    isAuth(url) ? authReply(url) : { json },
  );
  return new YahooClient({ fetch, minIntervalMs: 0, retries: 0, cacheEnabled: false });
}

describe("Ticker options", () => {
  it("lists expiration dates", async () => {
    const exps = await new Ticker("AAPL", client()).options();
    expect(exps).toEqual([new Date(EXP1 * 1000), new Date(EXP2 * 1000)]);
  });

  it("parses calls and puts of a chain", async () => {
    const chain = await new Ticker("AAPL", client()).optionChain();
    expect(chain.underlyingSymbol).toBe("AAPL");
    expect(chain.strikes).toEqual([190, 200, 210]);
    expect(chain.calls).toHaveLength(1);
    expect(chain.calls[0]).toMatchObject({
      contractSymbol: "AAPL231114C00200000",
      strike: 200,
      lastPrice: 5.5,
      inTheMoney: true,
    });
    expect(chain.calls[0]!.expiration).toEqual(new Date(EXP1 * 1000));
    expect(chain.puts[0]!.inTheMoney).toBe(false);
    // Absent numeric fields default to null, not undefined.
    expect(chain.puts[0]!.volume).toBeNull();
  });

  it("passes the date param when an expiration is requested", async () => {
    const fetch = makeFakeFetch((url): FakeResponseSpec =>
      isAuth(url) ? authReply(url) : { json: optionsJson() },
    );
    const c = new YahooClient({ fetch, minIntervalMs: 0, cacheEnabled: false });
    await new Ticker("AAPL", c).optionChain(new Date(EXP2 * 1000));
    const call = fetch.calls.find((x) => x.url.includes("/finance/options/"));
    expect(call?.url).toContain(`date=${EXP2}`);
  });

  it("throws NotFoundError on an empty result", async () => {
    const c = client({ optionChain: { result: [], error: null } });
    await expect(new Ticker("NOPE", c).optionChain()).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
