/**
 * `YahooClient` — the single HTTP entry point every higher-level module uses.
 *
 * Responsibilities (and nothing more):
 *   - build URLs and attach query params
 *   - acquire/attach cookie + crumb credentials (via {@link AuthManager})
 *   - serialize traffic through a {@link RateLimiter}
 *   - cache successful JSON responses (via a {@link CacheStore})
 *   - retry transient failures and re-authenticate once on 401
 *   - map non-2xx responses onto the typed error hierarchy
 *
 * It knows nothing about tickers, financials, or any Yahoo schema. Domain
 * modules depend on this class through its small public surface (`getJson`).
 */
import { AuthManager } from "./auth.js";
import { MemoryCache, type CacheStore } from "./cache.js";
import {
  DataError,
  NotFoundError,
  RateLimitError,
  RequestError,
  AuthError,
  TimeoutError,
} from "./errors.js";
import { RateLimiter } from "./rate-limiter.js";
import type { FetchLike, GetJsonOptions } from "./types.js";
import { appendQuery, buildUrl } from "./url.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface YahooClientOptions {
  /** Cache implementation. Defaults to an in-memory cache. */
  cache?: CacheStore;
  /** Whether to cache JSON responses by default. Default `true`. */
  cacheEnabled?: boolean;
  /** Default cache TTL in ms. Default 5 minutes. */
  cacheTtlMs?: number;
  /** User-Agent sent on every request. */
  userAgent?: string;
  /** Max simultaneous in-flight requests. Default 1. */
  maxConcurrent?: number;
  /** Minimum spacing between request starts, in ms. Default 200. */
  minIntervalMs?: number;
  /** Per-request timeout in ms. Default 30000. */
  timeoutMs?: number;
  /** Retry attempts for transient failures (network/5xx/429). Default 2. */
  retries?: number;
  /** Base backoff in ms between retries (exponential). Default 500. */
  retryBackoffMs?: number;
  /** Inject a custom fetch (tests, proxies). Defaults to global `fetch`. */
  fetch?: FetchLike;
}

export class YahooClient {
  private readonly fetch: FetchLike;
  private readonly auth: AuthManager;
  private readonly cache: CacheStore;
  private readonly limiter: RateLimiter;

  private readonly userAgent: string;
  private readonly cacheEnabled: boolean;
  private readonly cacheTtlMs: number;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryBackoffMs: number;

  constructor(options: YahooClientOptions = {}) {
    const fetchImpl = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!fetchImpl) {
      throw new Error(
        "No global fetch available. Use Node 18+ or pass `fetch` in options.",
      );
    }
    this.fetch = fetchImpl;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.cache = options.cache ?? new MemoryCache();
    this.cacheEnabled = options.cacheEnabled ?? true;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retries = Math.max(0, options.retries ?? 2);
    this.retryBackoffMs = Math.max(0, options.retryBackoffMs ?? 500);
    this.limiter = new RateLimiter({
      maxConcurrent: options.maxConcurrent ?? 1,
      minIntervalMs: options.minIntervalMs ?? 200,
    });
    this.auth = new AuthManager({
      fetch: this.fetch,
      userAgent: this.userAgent,
    });
  }

  /** Fetches a URL and parses the response as JSON of type `T`. */
  async getJson<T>(url: string | URL, options: GetJsonOptions = {}): Promise<T> {
    const baseUrl = buildUrl(url, options.params);
    const useCache = options.cache ?? this.cacheEnabled;
    const ttl = options.cacheTtlMs ?? this.cacheTtlMs;
    const cacheKey = `GET:${baseUrl}`;

    if (useCache) {
      const hit = await this.cache.get<T>(cacheKey);
      if (hit !== undefined) return hit;
    }

    const data = await this.limiter.run(() =>
      this.requestJson<T>(baseUrl, options.crumb ?? false, options.signal),
    );

    if (useCache) await this.cache.set(cacheKey, data, ttl);
    return data;
  }

  /** Discards cached credentials; the next authenticated call re-acquires them. */
  resetAuth(): void {
    this.auth.invalidate();
  }

  private async requestJson<T>(
    baseUrl: string,
    needsCrumb: boolean,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    let reauthed = false;

    for (let attempt = 0; ; attempt += 1) {
      let cookie: string | undefined;
      let url = baseUrl;
      if (needsCrumb) {
        const creds = await this.auth.getCredentials();
        cookie = creds.cookie;
        url = appendQuery(baseUrl, { crumb: creds.crumb });
      }

      let res: Response;
      try {
        res = await this.doFetch(url, cookie, signal);
      } catch (cause) {
        if (attempt < this.retries && !isAbort(cause)) {
          await this.backoff(attempt);
          continue;
        }
        if (isAbort(cause)) {
          throw new TimeoutError(`Request to ${url} timed out or was aborted`, {
            cause,
          });
        }
        throw new RequestError("Network request failed", {
          status: 0,
          url,
          cause,
        });
      }

      // Re-authenticate exactly once on a 401 for crumbed requests.
      if (res.status === 401 && needsCrumb && !reauthed) {
        reauthed = true;
        this.auth.invalidate();
        continue;
      }

      // Retry transient server / throttling responses.
      if ((res.status === 429 || res.status >= 500) && attempt < this.retries) {
        await this.backoff(attempt);
        continue;
      }

      return this.parse<T>(res, url);
    }
  }

  private async doFetch(
    url: string,
    cookie: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      Accept: "application/json,text/plain,*/*",
    };
    if (cookie) headers.Cookie = cookie;

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const composite = signal ? anySignal([signal, timeout]) : timeout;

    return this.fetch(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: composite,
    });
  }

  private async parse<T>(res: Response, url: string): Promise<T> {
    if (res.status === 429) {
      throw new RateLimitError(`Rate limited by Yahoo (HTTP 429) for ${url}`);
    }
    if (res.status === 404) {
      throw new NotFoundError(`Resource not found (HTTP 404) for ${url}`);
    }
    if (res.status === 401) {
      throw new AuthError(`Unauthorized (HTTP 401) for ${url}`);
    }
    if (!res.ok) {
      const body = await safeText(res);
      throw new RequestError(`Request failed with HTTP ${res.status}`, {
        status: res.status,
        url,
        ...(body !== undefined ? { body } : {}),
      });
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new DataError(`Expected JSON from ${url} but parsing failed`, {
        cause,
      });
    }
  }

  private backoff(attempt: number): Promise<void> {
    const ms = this.retryBackoffMs * 2 ** attempt;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

async function safeText(res: Response): Promise<string | undefined> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return undefined;
  }
}

/** Minimal `AbortSignal.any` polyfill for environments that lack it. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const anyFn = (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn(signals);

  const controller = new AbortController();
  const onAbort = (signal: AbortSignal) => {
    controller.abort(signal.reason);
  };
  for (const signal of signals) {
    if (signal.aborted) {
      onAbort(signal);
      break;
    }
    signal.addEventListener("abort", () => onAbort(signal), { once: true });
  }
  return controller.signal;
}
