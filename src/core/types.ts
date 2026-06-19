/**
 * Shared types used across the core HTTP layer.
 *
 * Domain-specific types (history rows, quote info, financials, …) live next to
 * their own modules. This file is intentionally limited to transport concerns.
 */

/** A value that can be serialized into a URL query parameter. */
export type QueryValue = string | number | boolean | undefined | null;

/** Query parameters for an outgoing request. */
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

/** Options for a single JSON GET request. */
export interface GetJsonOptions {
  /** Query string parameters. */
  params?: QueryParams;
  /** Whether the request requires a crumb (appended automatically). Default false. */
  crumb?: boolean;
  /** Override the default cache behaviour for this call. */
  cache?: boolean;
  /** Per-request cache TTL in milliseconds. */
  cacheTtlMs?: number;
  /** AbortSignal to cancel the request. */
  signal?: AbortSignal;
}

/** The subset of the WHATWG `fetch` signature this library relies on. */
export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;
