/**
 * `LiveStream` — real-time quotes over Yahoo's streaming WebSocket.
 *
 * Connects to `wss://streamer.finance.yahoo.com`, subscribes to symbols, and
 * emits decoded {@link PricingData} updates. Uses the global `WebSocket`
 * (Node 22+); a constructor can be injected for tests or custom transports.
 */
import { decodePricingMessage, type PricingData } from "./protobuf.js";

const DEFAULT_URL = "wss://streamer.finance.yahoo.com/?version=2";

export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type WebSocketCtor = new (url: string) => WebSocketLike;

export interface LiveStreamOptions {
  url?: string;
  /** WebSocket implementation. Defaults to the global `WebSocket`. */
  WebSocket?: WebSocketCtor;
}

type Handlers = {
  pricing: (data: PricingData) => void;
  open: () => void;
  close: (info: { code?: number; reason?: string }) => void;
  error: (err: unknown) => void;
};

const OPEN = 1;

export class LiveStream {
  private readonly url: string;
  private readonly ctor: WebSocketCtor;
  private ws: WebSocketLike | undefined;
  private readonly subscribed = new Set<string>();
  private readonly listeners: { [K in keyof Handlers]: Set<Handlers[K]> } = {
    pricing: new Set(),
    open: new Set(),
    close: new Set(),
    error: new Set(),
  };

  constructor(options: LiveStreamOptions = {}) {
    this.url = options.url ?? DEFAULT_URL;
    const ctor = options.WebSocket ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
    if (!ctor) {
      throw new Error(
        "No global WebSocket available. Use Node 22+ or pass `WebSocket` in options.",
      );
    }
    this.ctor = ctor;
  }

  /** Opens the connection. Resolves once the socket is open. */
  connect(): Promise<void> {
    if (this.ws) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const ws = new this.ctor(this.url);
      this.ws = ws;

      ws.onopen = () => {
        this.flushSubscriptions();
        this.emit("open");
        resolve();
      };
      ws.onmessage = (ev) => this.handleMessage(ev.data);
      ws.onclose = (ev) => {
        this.ws = undefined;
        this.emit("close", { ...(ev.code !== undefined ? { code: ev.code } : {}), ...(ev.reason !== undefined ? { reason: ev.reason } : {}) });
      };
      ws.onerror = (err) => {
        this.emit("error", err);
        reject(err instanceof Error ? err : new Error("WebSocket error"));
      };
    });
  }

  /** Subscribes to one or more symbols (queued until the socket is open). */
  subscribe(symbols: string | string[]): void {
    const list = normalize(symbols);
    for (const s of list) this.subscribed.add(s);
    if (this.isOpen()) this.send({ subscribe: list });
  }

  /** Unsubscribes from one or more symbols. */
  unsubscribe(symbols: string | string[]): void {
    const list = normalize(symbols);
    for (const s of list) this.subscribed.delete(s);
    if (this.isOpen()) this.send({ unsubscribe: list });
  }

  /** Registers an event listener. Returns an unsubscribe function. */
  on<K extends keyof Handlers>(event: K, handler: Handlers[K]): () => void {
    this.listeners[event].add(handler);
    return () => this.off(event, handler);
  }

  /** Removes an event listener. */
  off<K extends keyof Handlers>(event: K, handler: Handlers[K]): void {
    this.listeners[event].delete(handler);
  }

  /** Closes the connection. */
  close(): void {
    this.ws?.close();
    this.ws = undefined;
  }

  /** Currently subscribed symbols. */
  get symbols(): string[] {
    return [...this.subscribed];
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let parsed: { message?: unknown };
    try {
      parsed = JSON.parse(data) as { message?: unknown };
    } catch {
      return; // ignore non-JSON frames (e.g. heartbeats)
    }
    if (typeof parsed.message !== "string") return;
    try {
      this.emit("pricing", decodePricingMessage(parsed.message));
    } catch (err) {
      this.emit("error", err);
    }
  }

  private flushSubscriptions(): void {
    if (this.subscribed.size > 0) this.send({ subscribe: [...this.subscribed] });
  }

  private isOpen(): boolean {
    return this.ws !== undefined && this.ws.readyState === OPEN;
  }

  private send(payload: Record<string, unknown>): void {
    this.ws?.send(JSON.stringify(payload));
  }

  private emit<K extends keyof Handlers>(
    event: K,
    ...args: Parameters<Handlers[K]>
  ): void {
    for (const handler of this.listeners[event]) {
      (handler as (...a: unknown[]) => void)(...args);
    }
  }
}

function normalize(symbols: string | string[]): string[] {
  const list = Array.isArray(symbols) ? symbols : [symbols];
  return [...new Set(list.map((s) => s.trim().toUpperCase()).filter(Boolean))];
}
