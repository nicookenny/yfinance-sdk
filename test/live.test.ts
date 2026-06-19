import { describe, it, expect } from "vitest";
import {
  decodePricingData,
  decodePricingMessage,
} from "../src/live/protobuf.js";
import { LiveStream, type WebSocketLike } from "../src/live/live.js";

// --- protobuf fixture builders ---

function varint(n: bigint): number[] {
  const out: number[] = [];
  let v = n;
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) b |= 0x80;
    out.push(b);
  } while (v > 0n);
  return out;
}
const zigzag = (n: bigint) => (n << 1n) ^ (n >> 63n);
const tag = (field: number, wire: number) =>
  Buffer.from(varint(BigInt((field << 3) | wire)));

/** Encodes a PricingData with id, price, dayVolume, marketCap. */
function buildPricing(): Buffer {
  const f = Buffer.alloc(4);
  f.writeFloatLE(150.25);
  const d = Buffer.alloc(8);
  d.writeDoubleLE(2.5e12);
  return Buffer.concat([
    tag(1, 2), Buffer.from([4]), Buffer.from("AAPL"),
    tag(2, 5), f,
    tag(9, 0), Buffer.from(varint(zigzag(1_000_000n))),
    tag(33, 1), d,
  ]);
}

describe("decodePricingData", () => {
  it("decodes strings, floats, sint64 and doubles", () => {
    const data = decodePricingData(buildPricing());
    expect(data.id).toBe("AAPL");
    expect(data.price).toBeCloseTo(150.25, 2);
    expect(data.dayVolume).toBe(1_000_000);
    expect(data.marketCap).toBeCloseTo(2.5e12);
  });

  it("decodes from a base64 message", () => {
    const data = decodePricingMessage(buildPricing().toString("base64"));
    expect(data.id).toBe("AAPL");
  });
});

// --- fake WebSocket ---

class FakeWebSocket implements WebSocketLike {
  static last: FakeWebSocket | undefined;
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.last = this;
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
  triggerOpen(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  emit(data: unknown): void {
    this.onmessage?.({ data });
  }
}

describe("LiveStream", () => {
  it("sends queued subscriptions on open", async () => {
    const stream = new LiveStream({ WebSocket: FakeWebSocket });
    stream.subscribe(["aapl", "msft"]);
    const connecting = stream.connect();
    FakeWebSocket.last!.triggerOpen();
    await connecting;

    expect(FakeWebSocket.last!.sent).toHaveLength(1);
    expect(JSON.parse(FakeWebSocket.last!.sent[0]!)).toEqual({
      subscribe: ["AAPL", "MSFT"],
    });
  });

  it("subscribes immediately when already open", async () => {
    const stream = new LiveStream({ WebSocket: FakeWebSocket });
    const connecting = stream.connect();
    FakeWebSocket.last!.triggerOpen();
    await connecting;

    stream.subscribe("NFLX");
    expect(JSON.parse(FakeWebSocket.last!.sent.at(-1)!)).toEqual({
      subscribe: ["NFLX"],
    });
  });

  it("emits decoded pricing on message", async () => {
    const stream = new LiveStream({ WebSocket: FakeWebSocket });
    const updates: string[] = [];
    stream.on("pricing", (d) => updates.push(d.id ?? ""));

    const connecting = stream.connect();
    FakeWebSocket.last!.triggerOpen();
    await connecting;

    FakeWebSocket.last!.emit(
      JSON.stringify({ message: buildPricing().toString("base64") }),
    );
    expect(updates).toEqual(["AAPL"]);
  });

  it("ignores non-JSON frames", async () => {
    const stream = new LiveStream({ WebSocket: FakeWebSocket });
    const errors: unknown[] = [];
    stream.on("error", (e) => errors.push(e));
    const connecting = stream.connect();
    FakeWebSocket.last!.triggerOpen();
    await connecting;

    FakeWebSocket.last!.emit("ping");
    expect(errors).toHaveLength(0);
  });

  it("tracks and reports subscribed symbols", () => {
    const stream = new LiveStream({ WebSocket: FakeWebSocket });
    stream.subscribe(["AAPL", "aapl", "MSFT"]);
    expect(stream.symbols).toEqual(["AAPL", "MSFT"]);
    stream.unsubscribe("AAPL");
    expect(stream.symbols).toEqual(["MSFT"]);
  });
});
