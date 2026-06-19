import { describe, it, expect } from "vitest";
import { buildUrl, appendQuery } from "../../src/core/url.js";

describe("buildUrl", () => {
  it("appends scalar params", () => {
    const url = buildUrl("https://x.test/path", { a: 1, b: "two", c: true });
    expect(url).toBe("https://x.test/path?a=1&b=two&c=true");
  });

  it("repeats keys for array values", () => {
    const url = buildUrl("https://x.test/q", { modules: ["a", "b"] });
    expect(url).toBe("https://x.test/q?modules=a&modules=b");
  });

  it("omits undefined and null", () => {
    const url = buildUrl("https://x.test/q", { a: undefined, b: null, c: 3 });
    expect(url).toBe("https://x.test/q?c=3");
  });

  it("preserves an existing query string", () => {
    const url = buildUrl("https://x.test/q?keep=1", { add: 2 });
    expect(url).toBe("https://x.test/q?keep=1&add=2");
  });
});

describe("appendQuery", () => {
  it("adds params without dropping existing ones", () => {
    const url = appendQuery("https://x.test/q?a=1", { crumb: "abc" });
    expect(url).toBe("https://x.test/q?a=1&crumb=abc");
  });
});
