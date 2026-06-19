# yahoo-finance-ts

A typed TypeScript port of [yfinance](https://github.com/ranaroussi/yfinance) for **Node.js**.

- Pure library — no server, no framework. Just import and call.
- Tabular data as **arrays of typed objects** (no DataFrame clone).
- Organized by domain, not by mirroring yfinance's Python internals.
- Typed error hierarchy, pluggable cache, built-in rate limiting and auth.

> Status: **Steps 0–2 complete** (HTTP core + Ticker history + quote/info).
> Higher-level modules are landing incrementally — see the roadmap below.

## Install

```bash
npm install yahoo-finance-ts
```

Requires Node.js 18+ (native `fetch`).

## Usage (Ticker)

```ts
import { Ticker } from "yahoo-finance-ts";

const aapl = new Ticker("AAPL");

const rows = await aapl.history({ period: "1mo", interval: "1d" });
// rows: { date, open, high, low, close, adjClose, volume, dividends?, stockSplits? }[]

const dividends = await aapl.dividends(); // { date, amount }[]
const splits = await aapl.splits();       // { date, ratio, numerator, denominator }[]
const actions = await aapl.actions();     // merged, chronologically sorted
```

By default `history()` auto-adjusts OHLC with the adjusted close (set
`autoAdjust: false` to keep raw prices and the `adjClose` column) and includes
dividend/split columns (`actions: false` to omit). Use `start`/`end` (Date,
ms-epoch, or `YYYY-MM-DD`) for an explicit range instead of `period`.

```ts
const info = await aapl.info();            // flattened company/quote record
const fast = await aapl.fastInfo();        // cheap snapshot: price, marketCap, …
const cal = await aapl.calendar();         // earnings + dividend dates
const recs = await aapl.recommendations(); // analyst trend per period
const raw = await aapl.quoteSummary(["price", "summaryDetail"]); // typed modules
```

## Usage (core layer)

The foundation exposes a `YahooClient` that handles cookies, crumb tokens, rate
limiting, caching, retries, and error mapping. Domain wrappers (`Ticker`, …)
build on top of it in later steps.

```ts
import { YahooClient, NotFoundError } from "yahoo-finance-ts";

const client = new YahooClient();

try {
  const data = await client.getJson(
    "https://query1.finance.yahoo.com/v10/finance/quoteSummary/AAPL",
    { params: { modules: ["price"] }, crumb: true },
  );
  console.log(data);
} catch (err) {
  if (err instanceof NotFoundError) console.error("Unknown symbol");
  else throw err;
}
```

### Options

```ts
new YahooClient({
  maxConcurrent: 1,       // simultaneous in-flight requests
  minIntervalMs: 200,     // spacing between request starts
  timeoutMs: 30_000,      // per-request timeout
  retries: 2,             // transient-failure retries (network/5xx/429)
  cacheEnabled: true,     // cache JSON responses
  cacheTtlMs: 300_000,    // default cache TTL
  // cache: new MemoryCache(),  // or your own CacheStore
  // fetch: customFetch,        // inject a proxy-aware fetch
});
```

### Errors

All thrown errors extend `YahooFinanceError`:
`AuthError`, `RateLimitError`, `NotFoundError`, `RequestError`, `DataError`,
`TimeoutError`.

> **Note:** Yahoo throttles its crumb endpoint heavily on datacenter IPs (HTTP
> 429) — the same limitation yfinance has. The client retries and surfaces a
> clear `AuthError`; residential IPs work best.

## Roadmap

| Step | Module | Status |
|------|--------|--------|
| 0 | Foundation (HTTP core: client, auth, cache, rate-limit, errors) | ✅ Done |
| 1 | Ticker + history (OHLCV, dividends, splits) | ✅ Done |
| 2 | Quote / info / fastInfo / calendar / recommendations | ✅ Done |
| 3 | Fundamentals (income, balance sheet, cash flow, earnings) | ⏳ Next |
| 4 | Holders / insiders / analysis | |
| 5 | Options chains | |
| 6 | Bulk download + Tickers | |
| 7 | Search / Lookup / Screener | |
| 8 | Domain: Market / Sector / Industry | |
| 9 | Funds | |
| 10 | Live WebSocket streaming | |

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

Apache-2.0 (same as yfinance).
