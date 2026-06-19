/** Public surface of the core HTTP layer. */
export { YahooClient } from "./client.js";
export type { YahooClientOptions } from "./client.js";
export { MemoryCache } from "./cache.js";
export type { CacheStore } from "./cache.js";
export { RateLimiter } from "./rate-limiter.js";
export type { RateLimiterOptions } from "./rate-limiter.js";
export { AuthManager } from "./auth.js";
export type { AuthManagerOptions, Credentials } from "./auth.js";
export { buildUrl, appendQuery } from "./url.js";
export type {
  QueryParams,
  QueryValue,
  GetJsonOptions,
  FetchLike,
} from "./types.js";
export {
  YahooFinanceError,
  AuthError,
  RateLimitError,
  NotFoundError,
  RequestError,
  DataError,
  TimeoutError,
} from "./errors.js";
