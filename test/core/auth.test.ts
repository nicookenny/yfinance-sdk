import { describe, it, expect } from "vitest";
import { AuthManager } from "../../src/core/auth.js";
import { AuthError } from "../../src/core/errors.js";
import { makeFakeFetch } from "../helpers/fake-fetch.js";

const UA = "test-agent";

describe("AuthManager", () => {
  it("acquires a cookie then exchanges it for a crumb", async () => {
    const fetch = makeFakeFetch((url) => {
      if (url.includes("getcrumb")) return { body: "the-crumb" };
      return { setCookies: ["A1=token; Path=/; Domain=.yahoo.com"] };
    });
    const auth = new AuthManager({ fetch, userAgent: UA });

    const creds = await auth.getCredentials();
    expect(creds.cookie).toBe("A1=token");
    expect(creds.crumb).toBe("the-crumb");

    // The crumb request must carry the cookie we just obtained.
    const crumbCall = fetch.calls.find((c) => c.url.includes("getcrumb"));
    expect(crumbCall?.cookie).toBe("A1=token");
  });

  it("caches credentials across calls", async () => {
    const fetch = makeFakeFetch((url) =>
      url.includes("getcrumb")
        ? { body: "crumb" }
        : { setCookies: ["A1=token"] },
    );
    const auth = new AuthManager({ fetch, userAgent: UA });

    await auth.getCredentials();
    await auth.getCredentials();
    // 1 cookie + 1 crumb fetch, not duplicated.
    expect(fetch.calls).toHaveLength(2);
  });

  it("deduplicates concurrent acquisitions", async () => {
    const fetch = makeFakeFetch((url) =>
      url.includes("getcrumb")
        ? { body: "crumb" }
        : { setCookies: ["A1=token"] },
    );
    const auth = new AuthManager({ fetch, userAgent: UA });

    const [a, b] = await Promise.all([
      auth.getCredentials(),
      auth.getCredentials(),
    ]);
    expect(a).toEqual(b);
    expect(fetch.calls).toHaveLength(2);
  });

  it("re-acquires after invalidate()", async () => {
    const fetch = makeFakeFetch((url) =>
      url.includes("getcrumb")
        ? { body: "crumb" }
        : { setCookies: ["A1=token"] },
    );
    const auth = new AuthManager({ fetch, userAgent: UA });
    await auth.getCredentials();
    auth.invalidate();
    await auth.getCredentials();
    expect(fetch.calls).toHaveLength(4);
  });

  it("falls back to the next cookie URL when the first yields none", async () => {
    const fetch = makeFakeFetch((url) => {
      if (url.includes("getcrumb")) return { body: "crumb" };
      if (url.includes("fc.yahoo.com")) return { setCookies: [] };
      return { setCookies: ["A1=fromFinance"] };
    });
    const auth = new AuthManager({ fetch, userAgent: UA });
    const creds = await auth.getCredentials();
    expect(creds.cookie).toBe("A1=fromFinance");
  });

  it("throws AuthError when no cookie can be obtained", async () => {
    const fetch = makeFakeFetch(() => ({ setCookies: [] }));
    const auth = new AuthManager({ fetch, userAgent: UA });
    await expect(auth.getCredentials()).rejects.toBeInstanceOf(AuthError);
  });

  it("retries a throttled (429) crumb request then succeeds", async () => {
    let crumbHits = 0;
    const fetch = makeFakeFetch((url) => {
      if (url.includes("getcrumb")) {
        crumbHits += 1;
        return crumbHits < 3 ? { status: 429, body: "slow" } : { body: "crumb" };
      }
      return { setCookies: ["A1=token"] };
    });
    const auth = new AuthManager({
      fetch,
      userAgent: UA,
      crumbBackoffMs: 0,
      sleep: async () => {},
    });
    const creds = await auth.getCredentials();
    expect(creds.crumb).toBe("crumb");
    expect(crumbHits).toBe(3);
  });

  it("gives up on the crumb after exhausting retries", async () => {
    const fetch = makeFakeFetch((url) =>
      url.includes("getcrumb") ? { status: 429 } : { setCookies: ["A1=t"] },
    );
    const auth = new AuthManager({
      fetch,
      userAgent: UA,
      crumbRetries: 2,
      crumbBackoffMs: 0,
      sleep: async () => {},
    });
    await expect(auth.getCredentials()).rejects.toBeInstanceOf(AuthError);
  });

  it("throws AuthError on an empty crumb", async () => {
    const fetch = makeFakeFetch((url) =>
      url.includes("getcrumb") ? { body: "  " } : { setCookies: ["A1=t"] },
    );
    const auth = new AuthManager({ fetch, userAgent: UA });
    await expect(auth.getCredentials()).rejects.toBeInstanceOf(AuthError);
  });
});
