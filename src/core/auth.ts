/**
 * Cookie + crumb acquisition.
 *
 * Yahoo's JSON endpoints require two credentials obtained up front:
 *
 *   1. A session **cookie** (the `A1`/`A3` set-cookie returned by a Yahoo page).
 *   2. A **crumb** token tied to that cookie, fetched from `/v1/test/getcrumb`
 *      and appended as a query parameter on every authenticated request.
 *
 * This manager acquires both lazily, caches them, deduplicates concurrent
 * acquisitions, and can be invalidated (e.g. after a 401) to force a refresh.
 *
 * Only the "basic" strategy is implemented for now: fetch a cookie from one of a
 * list of bootstrap URLs, then exchange it for a crumb. The EU "csrf"/consent
 * flow can be layered on later behind the same interface.
 */
import { AuthError } from "./errors.js";
import type { FetchLike } from "./types.js";

export interface Credentials {
  /** Serialized `Cookie:` header value (e.g. `"A1=...; A3=..."`). */
  cookie: string;
  /** Crumb token appended as the `crumb` query parameter. */
  crumb: string;
}

export interface AuthManagerOptions {
  fetch: FetchLike;
  userAgent: string;
  /** URLs tried in order to obtain a session cookie. */
  cookieUrls?: string[];
  /** Endpoint that returns the crumb for a given cookie. */
  crumbUrl?: string;
  /** Retry attempts for a throttled/5xx crumb request. Default 3. */
  crumbRetries?: number;
  /** Base backoff in ms between crumb retries (exponential). Default 600. */
  crumbBackoffMs?: number;
  /** Sleep function (injectable for tests). Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_COOKIE_URLS = [
  "https://fc.yahoo.com",
  "https://finance.yahoo.com",
];
const DEFAULT_CRUMB_URL =
  "https://query1.finance.yahoo.com/v1/test/getcrumb";

export class AuthManager {
  private readonly fetch: FetchLike;
  private readonly userAgent: string;
  private readonly cookieUrls: string[];
  private readonly crumbUrl: string;
  private readonly crumbRetries: number;
  private readonly crumbBackoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  private credentials: Credentials | undefined;
  private inflight: Promise<Credentials> | undefined;

  constructor(options: AuthManagerOptions) {
    this.fetch = options.fetch;
    this.userAgent = options.userAgent;
    this.cookieUrls = options.cookieUrls ?? DEFAULT_COOKIE_URLS;
    this.crumbUrl = options.crumbUrl ?? DEFAULT_CRUMB_URL;
    this.crumbRetries = Math.max(0, options.crumbRetries ?? 3);
    this.crumbBackoffMs = Math.max(0, options.crumbBackoffMs ?? 600);
    this.sleep =
      options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * Returns valid credentials, acquiring them if necessary. Concurrent callers
   * share a single in-flight acquisition. Pass `force` to bypass the cache.
   */
  async getCredentials(force = false): Promise<Credentials> {
    if (!force && this.credentials !== undefined) return this.credentials;
    if (this.inflight !== undefined) return this.inflight;

    this.inflight = this.acquire().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  /** Drops cached credentials so the next call re-acquires them. */
  invalidate(): void {
    this.credentials = undefined;
  }

  private async acquire(): Promise<Credentials> {
    const cookie = await this.fetchCookie();
    const crumb = await this.fetchCrumb(cookie);
    this.credentials = { cookie, crumb };
    return this.credentials;
  }

  private async fetchCookie(): Promise<string> {
    let lastError: unknown;
    for (const url of this.cookieUrls) {
      try {
        const res = await this.fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": this.userAgent,
            Accept: "text/html,application/xhtml+xml,application/xml,*/*",
          },
          redirect: "follow",
        });
        const cookie = serializeSetCookie(res);
        if (cookie.length > 0) return cookie;
        lastError = new AuthError(`No Set-Cookie header from ${url}`);
      } catch (cause) {
        lastError = cause;
      }
    }
    throw new AuthError("Failed to obtain a Yahoo session cookie", {
      cause: lastError,
    });
  }

  private async fetchCrumb(cookie: string): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.crumbRetries; attempt += 1) {
      let res: Response;
      try {
        res = await this.fetch(this.crumbUrl, {
          method: "GET",
          headers: {
            "User-Agent": this.userAgent,
            Cookie: cookie,
            Accept: "text/plain,*/*",
          },
        });
      } catch (cause) {
        lastError = cause;
        if (attempt < this.crumbRetries) {
          await this.sleep(this.crumbBackoffMs * 2 ** attempt);
          continue;
        }
        throw new AuthError("Failed to request crumb", { cause });
      }

      // Throttling / transient server errors are worth retrying.
      if ((res.status === 429 || res.status >= 500) && attempt < this.crumbRetries) {
        lastError = new AuthError(`Crumb request returned HTTP ${res.status}`);
        await this.sleep(this.crumbBackoffMs * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        throw new AuthError(`Crumb request failed with HTTP ${res.status}`);
      }

      const crumb = (await res.text()).trim();
      if (crumb.length === 0 || crumb.includes("<html")) {
        throw new AuthError("Received an empty or invalid crumb");
      }
      return crumb;
    }

    throw new AuthError("Crumb request exhausted retries", { cause: lastError });
  }
}

/**
 * Collapses a response's `Set-Cookie` headers into a `Cookie:` header value,
 * keeping only the `name=value` pair of each cookie.
 */
function serializeSetCookie(res: Response): string {
  // `getSetCookie` is available on undici/Node 18.14+ and the browser fetch.
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : splitLegacySetCookie(res.headers.get("set-cookie"));

  const pairs = raw
    .map((c) => c.split(";", 1)[0]?.trim())
    .filter((p): p is string => !!p && p.includes("="));

  return pairs.join("; ");
}

function splitLegacySetCookie(value: string | null): string[] {
  if (!value) return [];
  // Best-effort split that avoids breaking on the comma inside `Expires=`.
  return value.split(/,(?=\s*[^;,\s]+=)/);
}
