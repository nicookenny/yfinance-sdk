import { describe, it, expect } from "vitest";
import { YahooClient } from "../../src/core/client.js";
import {
  NotFoundError,
  RateLimitError,
  RequestError,
  DataError,
} from "../../src/core/errors.js";
import { makeFakeFetch, type FakeResponseSpec } from "../helpers/fake-fetch.js";

const isAuth = (url: string) => {
  if (url.includes("getcrumb")) return true;
  const host = new URL(url).host;
  return host === "fc.yahoo.com" || host === "finance.yahoo.com";
};

const authReply = (url: string): FakeResponseSpec =>
  url.includes("getcrumb")
    ? { body: "CRUMB123" }
    : { setCookies: ["A1=cookietoken"] };

/** Wraps a data handler so auth endpoints are answered automatically. */
function withAuth(
  dataHandler: (url: string) => FakeResponseSpec,
): (url: string) => FakeResponseSpec {
  return (url) => (isAuth(url) ? authReply(url) : dataHandler(url));
}

const fast = { retries: 0, minIntervalMs: 0 } as const;

describe("YahooClient.getJson", () => {
  it("fetches and parses JSON", async () => {
    const fetch = makeFakeFetch(withAuth(() => ({ json: { ok: true, n: 7 } })));
    const client = new YahooClient({ fetch, ...fast });
    const data = await client.getJson<{ ok: boolean; n: number }>(
      "https://query1.finance.yahoo.com/v8/data",
    );
    expect(data).toEqual({ ok: true, n: 7 });
  });

  it("caches responses by URL", async () => {
    const fetch = makeFakeFetch(withAuth(() => ({ json: { v: 1 } })));
    const client = new YahooClient({ fetch, ...fast });
    const url = "https://query1.finance.yahoo.com/v8/cacheme";
    await client.getJson(url);
    await client.getJson(url);
    const dataCalls = fetch.calls.filter((c) => c.url.includes("cacheme"));
    expect(dataCalls).toHaveLength(1);
  });

  it("can bypass the cache per request", async () => {
    const fetch = makeFakeFetch(withAuth(() => ({ json: { v: 1 } })));
    const client = new YahooClient({ fetch, ...fast });
    const url = "https://query1.finance.yahoo.com/v8/nocache";
    await client.getJson(url, { cache: false });
    await client.getJson(url, { cache: false });
    const dataCalls = fetch.calls.filter((c) => c.url.includes("nocache"));
    expect(dataCalls).toHaveLength(2);
  });

  it("appends the crumb and sends the cookie when crumb is required", async () => {
    const fetch = makeFakeFetch(withAuth(() => ({ json: { v: 1 } })));
    const client = new YahooClient({ fetch, ...fast });
    await client.getJson("https://query1.finance.yahoo.com/v10/secure", {
      crumb: true,
    });
    const dataCall = fetch.calls.find((c) => c.url.includes("/v10/secure"));
    expect(dataCall?.url).toContain("crumb=CRUMB123");
    expect(dataCall?.cookie).toBe("A1=cookietoken");
  });

  it("maps 404 to NotFoundError", async () => {
    const fetch = makeFakeFetch(withAuth(() => ({ status: 404, body: "no" })));
    const client = new YahooClient({ fetch, ...fast });
    await expect(
      client.getJson("https://query1.finance.yahoo.com/v8/missing"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps a persistent 429 to RateLimitError", async () => {
    const fetch = makeFakeFetch(withAuth(() => ({ status: 429, body: "slow" })));
    const client = new YahooClient({ fetch, ...fast });
    await expect(
      client.getJson("https://query1.finance.yahoo.com/v8/throttled"),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("maps other non-2xx codes to RequestError with status", async () => {
    const fetch = makeFakeFetch(withAuth(() => ({ status: 403, body: "deny" })));
    const client = new YahooClient({ fetch, ...fast });
    const err = await client
      .getJson("https://query1.finance.yahoo.com/v8/forbidden")
      .catch((e) => e);
    expect(err).toBeInstanceOf(RequestError);
    expect((err as RequestError).status).toBe(403);
  });

  it("raises DataError on invalid JSON", async () => {
    const fetch = makeFakeFetch(withAuth(() => ({ body: "not json" })));
    const client = new YahooClient({ fetch, ...fast });
    await expect(
      client.getJson("https://query1.finance.yahoo.com/v8/badjson"),
    ).rejects.toBeInstanceOf(DataError);
  });

  it("re-authenticates once on a 401 then succeeds", async () => {
    let secureHits = 0;
    const fetch = makeFakeFetch((url) => {
      if (isAuth(url)) return authReply(url);
      secureHits += 1;
      return secureHits === 1
        ? { status: 401, body: "stale" }
        : { json: { v: "ok" } };
    });
    const client = new YahooClient({ fetch, ...fast });
    const data = await client.getJson("https://query1.finance.yahoo.com/v10/x", {
      crumb: true,
    });
    expect(data).toEqual({ v: "ok" });
    expect(secureHits).toBe(2);
  });

  it("retries transient 500s then succeeds", async () => {
    let hits = 0;
    const fetch = makeFakeFetch(
      withAuth(() => {
        hits += 1;
        return hits < 2 ? { status: 500, body: "err" } : { json: { v: 1 } };
      }),
    );
    const client = new YahooClient({
      fetch,
      retries: 2,
      retryBackoffMs: 0,
      minIntervalMs: 0,
    });
    const data = await client.getJson("https://query1.finance.yahoo.com/v8/flaky");
    expect(data).toEqual({ v: 1 });
    expect(hits).toBe(2);
  });

  it("retries network errors then surfaces RequestError when exhausted", async () => {
    const fetch = makeFakeFetch(
      withAuth(() => {
        throw new TypeError("network down");
      }),
    );
    const client = new YahooClient({
      fetch,
      retries: 1,
      retryBackoffMs: 0,
      minIntervalMs: 0,
    });
    const err = await client
      .getJson("https://query1.finance.yahoo.com/v8/down")
      .catch((e) => e);
    expect(err).toBeInstanceOf(RequestError);
    expect((err as RequestError).status).toBe(0);
  });
});
