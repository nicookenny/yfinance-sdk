/**
 * Cooperative rate limiter.
 *
 * Yahoo's endpoints throttle aggressively, so every outgoing request is funneled
 * through this limiter. It enforces two constraints at once:
 *
 *  - `maxConcurrent`  — at most N requests in flight simultaneously.
 *  - `minIntervalMs`  — at least this many ms between successive request starts.
 *
 * Work is queued FIFO. The scheduler is injectable (`setTimeoutFn` / `now`) so
 * tests can drive it with fake timers.
 */

export interface RateLimiterOptions {
  maxConcurrent?: number;
  minIntervalMs?: number;
  now?: () => number;
  setTimeoutFn?: (cb: () => void, ms: number) => void;
}

type Task = () => void;

export class RateLimiter {
  private readonly maxConcurrent: number;
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly setTimeoutFn: (cb: () => void, ms: number) => void;

  private active = 0;
  private lastStart = Number.NEGATIVE_INFINITY;
  private readonly queue: Task[] = [];

  constructor(options: RateLimiterOptions = {}) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 1);
    this.minIntervalMs = Math.max(0, options.minIntervalMs ?? 0);
    this.now = options.now ?? Date.now;
    this.setTimeoutFn =
      options.setTimeoutFn ?? ((cb, ms) => void setTimeout(cb, ms));
  }

  /** Runs `fn` once a slot is available, respecting concurrency and spacing. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = () => {
        this.active += 1;
        this.lastStart = this.now();
        fn().then(resolve, reject).finally(() => {
          this.active -= 1;
          this.schedule();
        });
      };
      this.queue.push(task);
      this.schedule();
    });
  }

  private schedule(): void {
    if (this.active >= this.maxConcurrent) return;
    if (this.queue.length === 0) return;

    const wait = this.lastStart + this.minIntervalMs - this.now();
    if (wait > 0) {
      this.setTimeoutFn(() => this.schedule(), wait);
      return;
    }

    const task = this.queue.shift();
    task?.();
  }
}
