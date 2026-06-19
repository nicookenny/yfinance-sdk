/**
 * Pluggable response cache.
 *
 * yfinance leans on an on-disk SQLite cache (peewee) for cookies and timezone
 * lookups. Here the cache is an interface so callers can plug in whatever they
 * need (memory, file, Redis, …). The default {@link MemoryCache} keeps the core
 * dependency-free; a SQLite/file adapter can be added later without touching the
 * client.
 */

export interface CacheStore {
  /** Returns the cached value for `key`, or `undefined` if missing/expired. */
  get<T>(key: string): Promise<T | undefined>;
  /** Stores `value` under `key`, expiring after `ttlMs` (omit for no expiry). */
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  /** Removes `key` from the cache. */
  delete(key: string): Promise<void>;
  /** Clears the entire cache. */
  clear(): Promise<void>;
}

interface Entry {
  value: unknown;
  /** Epoch ms at which this entry expires, or `undefined` for no expiry. */
  expiresAt: number | undefined;
}

/**
 * In-memory cache with per-entry TTL. Suitable as a default for a single
 * process; expired entries are evicted lazily on read.
 *
 * A clock can be injected for deterministic testing.
 */
export class MemoryCache implements CacheStore {
  private readonly store = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs !== undefined ? this.now() + ttlMs : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  /** Number of entries currently held (including not-yet-evicted expired ones). */
  get size(): number {
    return this.store.size;
  }
}
