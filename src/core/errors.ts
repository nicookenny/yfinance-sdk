/**
 * Typed error hierarchy for the library.
 *
 * Everything thrown by the client is a {@link YahooFinanceError}, so callers can
 * `catch (e) { if (e instanceof YahooFinanceError) ... }` and narrow from there.
 */

/** Base class for every error raised by this library. */
export class YahooFinanceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Failure to obtain or refresh the cookie/crumb credentials. */
export class AuthError extends YahooFinanceError {}

/** Yahoo returned HTTP 429 (too many requests). */
export class RateLimitError extends YahooFinanceError {}

/** The requested symbol / resource does not exist (HTTP 404 or empty result). */
export class NotFoundError extends YahooFinanceError {
  readonly symbol: string | undefined;
  constructor(message: string, options?: { cause?: unknown; symbol?: string }) {
    super(message, { ...(options?.cause !== undefined ? { cause: options.cause } : {}) });
    this.symbol = options?.symbol;
  }
}

/** A non-2xx HTTP response that is not specifically auth / rate-limit / not-found. */
export class RequestError extends YahooFinanceError {
  readonly status: number;
  readonly url: string;
  readonly body: string | undefined;
  constructor(
    message: string,
    options: { status: number; url: string; body?: string; cause?: unknown },
  ) {
    super(message, { ...(options.cause !== undefined ? { cause: options.cause } : {}) });
    this.status = options.status;
    this.url = options.url;
    this.body = options.body;
  }
}

/** The response was received but its shape was not what we expected. */
export class DataError extends YahooFinanceError {}

/** The request did not complete within the configured timeout. */
export class TimeoutError extends YahooFinanceError {}
