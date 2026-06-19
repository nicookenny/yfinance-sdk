import { describe, it, expect } from "vitest";
import { RateLimiter } from "../../src/core/rate-limiter.js";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe("RateLimiter", () => {
  it("caps the number of concurrent tasks", async () => {
    const limiter = new RateLimiter({ maxConcurrent: 2, minIntervalMs: 0 });
    const started: number[] = [];
    const defs = [deferred(), deferred(), deferred()];
    const runs = defs.map((d, i) =>
      limiter.run(() => {
        started.push(i);
        return d.promise;
      }),
    );

    // Only the first two may start; the third waits for a free slot.
    expect(started).toEqual([0, 1]);

    defs[0]!.resolve();
    await runs[0];
    await flush();

    expect(started).toEqual([0, 1, 2]);
    defs[1]!.resolve();
    defs[2]!.resolve();
    await Promise.all(runs);
  });

  it("spaces task starts by minIntervalMs using injected timers", async () => {
    let now = 0;
    const timers: Array<{ at: number; cb: () => void }> = [];
    const limiter = new RateLimiter({
      maxConcurrent: 1,
      minIntervalMs: 100,
      now: () => now,
      setTimeoutFn: (cb, ms) => {
        timers.push({ at: now + ms, cb });
      },
    });

    const starts: number[] = [];
    const defs = [deferred(), deferred()];
    const r0 = limiter.run(() => {
      starts.push(now);
      return defs[0]!.promise;
    });
    limiter.run(() => {
      starts.push(now);
      return defs[1]!.promise;
    });

    expect(starts).toEqual([0]);

    defs[0]!.resolve();
    await r0;
    await flush();

    // Second task must be deferred, not started yet.
    expect(starts).toEqual([0]);
    expect(timers).toHaveLength(1);

    now = 100;
    timers.shift()!.cb();
    expect(starts).toEqual([0, 100]);
  });

  it("propagates task rejections to the caller", async () => {
    const limiter = new RateLimiter({ maxConcurrent: 1 });
    await expect(
      limiter.run(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
  });
});
