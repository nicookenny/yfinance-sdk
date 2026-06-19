/**
 * URL/query-string helpers.
 *
 * Yahoo expects repeated keys for array values (e.g. `modules=a&modules=b`) and
 * omits `undefined`/`null` parameters entirely. `URLSearchParams` gives us both
 * for free once we normalize values.
 */
import type { QueryParams, QueryValue } from "./types.js";

/** Builds a full URL by merging `params` into `base`'s query string. */
export function buildUrl(base: string | URL, params?: QueryParams): string {
  const url = new URL(base.toString());
  if (params) appendParams(url.searchParams, params);
  return url.toString();
}

/** Returns a copy of `url` with `params` appended (existing query preserved). */
export function appendQuery(url: string, params: QueryParams): string {
  const u = new URL(url);
  appendParams(u.searchParams, params);
  return u.toString();
}

function appendParams(search: URLSearchParams, params: QueryParams): void {
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) appendOne(search, key, item);
    } else {
      appendOne(search, key, value);
    }
  }
}

function appendOne(
  search: URLSearchParams,
  key: string,
  value: QueryValue,
): void {
  if (value === undefined || value === null) return;
  search.append(key, String(value));
}
