import { describe, it, expect } from "vitest";
import { MemoryCache } from "../../src/core/cache.js";

describe("MemoryCache", () => {
  it("stores and retrieves values", async () => {
    const cache = new MemoryCache();
    await cache.set("a", { n: 1 });
    expect(await cache.get<{ n: number }>("a")).toEqual({ n: 1 });
  });

  it("returns undefined for missing keys", async () => {
    const cache = new MemoryCache();
    expect(await cache.get("nope")).toBeUndefined();
  });

  it("expires entries after the TTL using the injected clock", async () => {
    let now = 1000;
    const cache = new MemoryCache({ now: () => now });
    await cache.set("k", "v", 100);

    now = 1099;
    expect(await cache.get("k")).toBe("v");

    now = 1100;
    expect(await cache.get("k")).toBeUndefined();
  });

  it("treats missing TTL as no expiry", async () => {
    let now = 0;
    const cache = new MemoryCache({ now: () => now });
    await cache.set("k", "v");
    now = 10_000_000;
    expect(await cache.get("k")).toBe("v");
  });

  it("deletes and clears", async () => {
    const cache = new MemoryCache();
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.delete("a");
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("b")).toBe(2);
    await cache.clear();
    expect(await cache.get("b")).toBeUndefined();
  });
});
