import type { FetchLike } from "../../src/core/types.js";

export interface FakeResponseSpec {
  status?: number;
  body?: string;
  json?: unknown;
  /** Cookie pairs to expose as Set-Cookie headers. */
  setCookies?: string[];
  headers?: Record<string, string>;
}

export interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
  cookie: string | undefined;
}

/**
 * Builds a fetch implementation driven by a handler that receives the request
 * URL and returns a {@link FakeResponseSpec}. Every call is recorded for
 * assertions. The handler may be sync or async, and may throw to simulate a
 * network failure.
 */
export function makeFakeFetch(
  handler: (url: string, init: RequestInit | undefined) => FakeResponseSpec | Promise<FakeResponseSpec>,
): FetchLike & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const fn = (async (input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    const headers = new Headers(init?.headers);
    calls.push({ url, init, cookie: headers.get("cookie") ?? undefined });

    const spec = await handler(url, init);
    const status = spec.status ?? 200;
    const responseHeaders = new Headers(spec.headers);
    for (const cookie of spec.setCookies ?? []) {
      responseHeaders.append("set-cookie", cookie);
    }
    const body =
      spec.json !== undefined ? JSON.stringify(spec.json) : spec.body ?? "";
    return new Response(body, { status, headers: responseHeaders });
  }) as FetchLike & { calls: RecordedCall[] };

  fn.calls = calls;
  return fn;
}
