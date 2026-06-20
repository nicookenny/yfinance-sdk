# yfinance-sdk

**A typed TypeScript port of [yfinance](https://github.com/ranaroussi/yfinance) for Node.js.**

`yf-sdk` brings the full surface of yfinance to TypeScript — prices, fundamentals, options, holders, analyst data, search, screeners, sectors, funds, and live streaming — with first-class types and zero runtime dependencies.

[![npm](https://img.shields.io/npm/v/yf-sdk.svg)](https://www.npmjs.com/package/yf-sdk)

- **Typed, not stringly-typed** — every endpoint returns arrays of typed objects (no DataFrame clone, no `any` soup).
- **Batteries included** — cookie + crumb auth, rate limiting, response caching, retries, and a typed error hierarchy are built in.
- **Organized by domain** — clean module boundaries (`core`, `ticker`, `search`, `domain`, `funds`, `live`), not a 1:1 copy of yfinance's internals.
- **Node-native** — uses the platform `fetch` and `WebSocket`; no `axios`, no `ws`, no protobuf runtime.

---

## Install

```bash
npm install yf-sdk
```

Requires **Node.js 18+** (native `fetch`). Live streaming needs **Node 22+** (global `WebSocket`).

---

## Quick start

```ts
import { Ticker } from "yf-sdk";

const aapl = new Ticker("AAPL");

const history = await aapl.history({ period: "1mo", interval: "1d" });
const info = await aapl.info();
const income = await aapl.incomeStatement();

console.log(info.longName, info.marketCap);
console.log(history.at(-1)); // { date, open, high, low, close, adjClose, volume, ... }
```

---

## Ticker

A `Ticker` is the main entry point. Pass a shared `YahooClient` to reuse one auth session and rate limiter across many tickers.

### Prices & corporate actions

```ts
await aapl.history({ period: "1y", interval: "1d" }); // HistoryRow[]
await aapl.historyResult({ start: "2024-01-01", end: "2024-06-30" }); // rows + exchange meta
await aapl.dividends(); // { date, amount }[]
await aapl.splits();    // { date, ratio, numerator, denominator }[]
await aapl.actions();   // dividends + splits, merged & chronologically sorted
```

By default `history()` auto-adjusts OHLC with the adjusted close (`autoAdjust: false` keeps raw prices and the `adjClose` column) and includes dividend/split columns (`actions: false` to omit). Use `start`/`end` (Date, ms-epoch, or `YYYY-MM-DD`) for an explicit range instead of `period`.

### Quote, profile & analyst data

```ts
await aapl.info();           // flattened company/quote record (yfinance .info)
await aapl.fastInfo();       // cheap snapshot: price, marketCap, ranges
await aapl.calendar();       // earnings + dividend dates
await aapl.recommendations();// analyst trend per period
await aapl.quoteSummary(["price", "summaryDetail"]); // raw typed modules

await aapl.analystPriceTargets(); // { current, high, low, mean, ... }
await aapl.earningsEstimate();    // per-period EPS estimates
await aapl.revenueEstimate();
await aapl.epsTrend();
```

### Financial statements

```ts
await aapl.incomeStatement();                    // annual rows
await aapl.balanceSheet({ frequency: "quarterly" });
await aapl.cashflow();
// each row: { date, TotalRevenue, NetIncome, ... } keyed by Yahoo metric name
```

### Holders & insiders

```ts
await aapl.majorHolders();
await aapl.institutionalHolders();
await aapl.mutualFundHolders();
await aapl.insiderTransactions();
await aapl.insiderRoster();
```

### Options

```ts
const expirations = await aapl.options();        // Date[]
const chain = await aapl.optionChain();          // nearest expiration
const dated = await aapl.optionChain("2025-01-17"); // { calls, puts, strikes, ... }
```

### Funds & ETFs

```ts
const voo = new Ticker("VOO");
const data = await voo.fundsData();
// { topHoldings, sectorWeightings, assetClasses, fundOperations, ... }
```

---

## Bulk download & Tickers

```ts
import { download, Tickers } from "yf-sdk";

const { data, errors } = await download(["AAPL", "MSFT", "GOOG"], { period: "5d" });
// data: Record<symbol, HistoryRow[]> — per-symbol failures land in errors, batch never rejects

const group = new Tickers("AAPL MSFT NVDA");
const batch = await group.download({ interval: "1wk" });
group.ticker("AAPL").info();
```

---

## Search, lookup & screener

```ts
import { YahooClient, search, lookup, screen, and, gt, eq } from "yf-sdk";

const client = new YahooClient();

await search(client, "apple");                       // { quotes, news }
await lookup(client, "vanguard", { type: "etf" });   // typed symbol matches

// Predefined screen:
await screen(client, "day_gainers", { count: 10 });

// Custom screen with the composable query builder:
const query = and(gt("intradaymarketcap", 1e11), eq("region", "us"));
await screen(client, query, { sortField: "dayvolume", sortType: "DESC" });
```

Query builder operators: `gt`, `lt`, `gte`, `lte`, `eq`, `btwn`, `isin`, `and`, `or`.

---

## Sectors, industries & markets

```ts
import { Sector, Industry, Market } from "yf-sdk";

const tech = await new Sector("technology", client).fetch();
// { overview, topCompanies, topETFs, topMutualFunds, industries }

const chips = await new Industry("semiconductors", client).fetch();
const market = await new Market("US", client).summary();
```

---

## Live streaming

Real-time quotes over Yahoo's WebSocket, with a dependency-free protobuf decoder.

```ts
import { LiveStream } from "yf-sdk";

const stream = new LiveStream();
stream.on("pricing", (q) => console.log(q.id, q.price, q.changePercent));
stream.on("error", (e) => console.error(e));

stream.subscribe(["AAPL", "BTC-USD"]);
await stream.connect();
// later: stream.close();
```

---

## The `YahooClient`

Every higher-level helper runs on a `YahooClient`, which you can configure and share:

```ts
import { YahooClient, NotFoundError } from "yf-sdk";

const client = new YahooClient({
  maxConcurrent: 1,    // simultaneous in-flight requests
  minIntervalMs: 200,  // spacing between request starts
  timeoutMs: 30_000,   // per-request timeout
  retries: 2,          // transient-failure retries (network / 5xx / 429)
  cacheEnabled: true,  // cache JSON responses
  cacheTtlMs: 300_000, // default cache TTL
  // cache: new MemoryCache(), // or your own CacheStore
  // fetch: customFetch,       // inject a proxy-aware fetch
});

const aapl = new Ticker("AAPL", client);
```

### Errors

All thrown errors extend `YahooFinanceError`:
`AuthError`, `RateLimitError`, `NotFoundError`, `RequestError`, `DataError`, `TimeoutError`.

```ts
try {
  await new Ticker("NOTASYMBOL", client).info();
} catch (err) {
  if (err instanceof NotFoundError) console.error("Unknown symbol");
  else throw err;
}
```

> **Heads up:** Yahoo throttles its crumb endpoint heavily on datacenter IPs
> (HTTP 429) — the same limitation yfinance has. The client retries and surfaces
> a clear `AuthError`; residential IPs work best. The chart/history endpoint
> does not need a crumb and keeps working even when the crumb endpoint is
> throttled.

---

## Architecture

```
src/
├── core/      HTTP layer: client, cookie+crumb auth, cache, rate limiter, errors
├── ticker/    Ticker facade + history, quote, fundamentals, holders, analysis, options
├── download.ts / tickers.ts   bulk download + multi-ticker container
├── search/    search, lookup, screener + query builder
├── domain/    Sector, Industry, Market
├── funds/     fund/ETF holdings & weightings
└── live/      WebSocket stream + protobuf decoder
```

`core/` knows nothing about Yahoo schemas; every domain module depends on it
through the small `YahooClient.getJson` / `postJson` surface.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit (strict)
npm test            # 95 hermetic tests (no network)
npm run build       # ESM + CJS + .d.ts via tsup
```

Tests are fully hermetic — `fetch`, clocks, timers, and the WebSocket are
injected, so the suite runs offline and deterministically.

## License

Apache-2.0 — same as yfinance. This project is an independent reimplementation
and is not affiliated with or endorsed by Yahoo.
