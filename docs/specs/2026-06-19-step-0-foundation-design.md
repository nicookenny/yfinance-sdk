# Step 0 — Foundation (core HTTP layer)

**Date:** 2026-06-19
**Status:** Implemented
**Goal of the project:** 100% TypeScript port of [yfinance](https://github.com/ranaroussi/yfinance) for Node.js — a typed client library (no server, no Hono), structured by domain rather than mirroring yfinance's Python package layout.

## Cross-cutting decisions (apply to all steps)

| Decision | Choice |
|----------|--------|
| Deliverable | Pure TypeScript library published to npm. No HTTP server / Hono. |
| Runtime | Node.js only (native `fetch`, `fs`, `ws`, optional `better-sqlite3`). |
| Tabular data | Arrays of typed objects (e.g. `HistoryRow[]`), **not** a DataFrame clone. |
| Structure | Organized by domain (`core/`, `ticker/`, `search/`, …), simplified — not a 1:1 copy of yfinance folders. |
| Tests | Vitest, hermetic (injected `fetch`, clock, timers — no network in CI). |

## Scope of Step 0

The foundation every other module depends on. It owns transport only and knows
nothing about tickers or Yahoo schemas.

### Components

- **`errors.ts`** — typed hierarchy rooted at `YahooFinanceError`:
  `AuthError`, `RateLimitError`, `NotFoundError`, `RequestError` (carries
  `status`/`url`/`body`), `DataError`, `TimeoutError`.
- **`cache.ts`** — `CacheStore` interface + `MemoryCache` (per-entry TTL,
  injectable clock, lazy eviction). Default keeps core dependency-free; a
  file/SQLite adapter can be added later behind the same interface.
- **`rate-limiter.ts`** — `RateLimiter` enforcing `maxConcurrent` + minimum
  spacing between request starts. FIFO queue, injectable clock/timer for tests.
- **`auth.ts`** — `AuthManager`: acquires a session cookie from a list of
  bootstrap URLs, exchanges it for a crumb (`/v1/test/getcrumb`), caches both,
  deduplicates concurrent acquisitions, retries throttled crumb requests, and
  exposes `invalidate()` for forced refresh. Only the "basic" strategy today;
  the EU "csrf"/consent flow can be layered behind the same interface later.
- **`url.ts`** — `buildUrl` / `appendQuery`: array params repeat keys,
  `undefined`/`null` are dropped.
- **`client.ts`** — `YahooClient`, the single entry point. `getJson<T>()`:
  builds the URL, attaches crumb + cookie when required, serializes through the
  rate limiter, caches successful JSON, retries transient failures
  (network/5xx/429) with exponential backoff, re-authenticates once on a 401,
  and maps non-2xx responses onto the typed errors.

### Data flow

```
caller → YahooClient.getJson
            → cache hit? return
            → RateLimiter.run
                → AuthManager.getCredentials (if crumb required)
                → fetch (timeout + abort)
                → retry / re-auth as needed
                → parse + map errors
            → cache store → return T
```

### Testing

33 hermetic tests across cache, url, rate-limiter, auth, and client — every
error path, caching, crumb attachment, 401 re-auth, and transient retry. A
fake-fetch helper records calls and simulates cookies, statuses, and network
failures.

### Known real-world limitation

Yahoo's `getcrumb` endpoint aggressively rate-limits datacenter IPs with HTTP
429 (the same issue yfinance users hit). The client handles this correctly
(retries, then a clear `AuthError`), but a live call from a throttled network
can still fail to obtain a crumb. Residential IPs and, later, the consent flow
mitigate this. Library logic is validated by the hermetic suite regardless.

## Next step

Step 1 — `Ticker` + price history (`/v8/finance/chart`): OHLCV rows, dividends,
splits, and actions as typed arrays.
