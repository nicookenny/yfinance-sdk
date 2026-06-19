/**
 * Minimal protobuf decoder for Yahoo's streaming `PricingData` message.
 *
 * The live socket sends `{ "message": "<base64>" }` frames whose payload is a
 * protobuf-encoded `PricingData`. Rather than pull in a protobuf runtime, this
 * decodes the fixed schema directly off the wire (the field map below mirrors
 * yfinance's `pricing.proto`).
 */

export interface PricingData {
  id?: string;
  price?: number;
  time?: number;
  currency?: string;
  exchange?: string;
  quoteType?: number;
  marketHours?: number;
  changePercent?: number;
  dayVolume?: number;
  dayHigh?: number;
  dayLow?: number;
  change?: number;
  shortName?: string;
  expireDate?: number;
  openPrice?: number;
  previousClose?: number;
  strikePrice?: number;
  underlyingSymbol?: string;
  openInterest?: number;
  optionsType?: number;
  miniOption?: number;
  lastSize?: number;
  bid?: number;
  bidSize?: number;
  ask?: number;
  askSize?: number;
  priceHint?: number;
  vol24hr?: number;
  volAllCurrencies?: number;
  fromCurrency?: string;
  lastMarket?: string;
  circulatingSupply?: number;
  marketCap?: number;
}

type FieldType = "string" | "float" | "double" | "sint64" | "int";

const FIELDS: Record<number, [keyof PricingData, FieldType]> = {
  1: ["id", "string"],
  2: ["price", "float"],
  3: ["time", "sint64"],
  4: ["currency", "string"],
  5: ["exchange", "string"],
  6: ["quoteType", "int"],
  7: ["marketHours", "int"],
  8: ["changePercent", "float"],
  9: ["dayVolume", "sint64"],
  10: ["dayHigh", "float"],
  11: ["dayLow", "float"],
  12: ["change", "float"],
  13: ["shortName", "string"],
  14: ["expireDate", "sint64"],
  15: ["openPrice", "float"],
  16: ["previousClose", "float"],
  17: ["strikePrice", "float"],
  18: ["underlyingSymbol", "string"],
  19: ["openInterest", "sint64"],
  20: ["optionsType", "int"],
  21: ["miniOption", "sint64"],
  22: ["lastSize", "sint64"],
  23: ["bid", "float"],
  24: ["bidSize", "sint64"],
  25: ["ask", "float"],
  26: ["askSize", "sint64"],
  27: ["priceHint", "sint64"],
  28: ["vol24hr", "sint64"],
  29: ["volAllCurrencies", "sint64"],
  30: ["fromCurrency", "string"],
  31: ["lastMarket", "string"],
  32: ["circulatingSupply", "double"],
  33: ["marketCap", "double"],
};

/** Decodes a base64 `PricingData` frame into a typed object. */
export function decodePricingMessage(base64: string): PricingData {
  return decodePricingData(Buffer.from(base64, "base64"));
}

/** Decodes raw `PricingData` protobuf bytes. */
export function decodePricingData(bytes: Uint8Array): PricingData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: PricingData = {};
  let pos = 0;

  while (pos < bytes.length) {
    const [tag, afterTag] = readVarint(bytes, pos);
    pos = afterTag;
    const fieldNum = Number(tag >> 3n);
    const wireType = Number(tag & 7n);
    const field = FIELDS[fieldNum];

    switch (wireType) {
      case 0: {
        const [value, next] = readVarint(bytes, pos);
        pos = next;
        if (field) {
          const [name, type] = field;
          assign(out, name, type === "sint64" ? zigzag(value) : Number(value));
        }
        break;
      }
      case 5: {
        const value = view.getFloat32(pos, true);
        pos += 4;
        if (field) assign(out, field[0], value);
        break;
      }
      case 1: {
        const value = view.getFloat64(pos, true);
        pos += 8;
        if (field) assign(out, field[0], value);
        break;
      }
      case 2: {
        const [len, afterLen] = readVarint(bytes, pos);
        pos = afterLen;
        const length = Number(len);
        const slice = bytes.subarray(pos, pos + length);
        pos += length;
        if (field) assign(out, field[0], new TextDecoder().decode(slice));
        break;
      }
      default:
        throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
  }

  return out;
}

function assign(
  out: PricingData,
  name: keyof PricingData,
  value: string | number,
): void {
  (out as Record<string, unknown>)[name] = value;
}

function readVarint(bytes: Uint8Array, start: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  let pos = start;
  for (;;) {
    const byte = bytes[pos];
    if (byte === undefined) throw new Error("Malformed varint: out of bounds");
    pos += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
  }
  return [result, pos];
}

/** ZigZag-decodes a varint into a signed number. */
function zigzag(value: bigint): number {
  return Number((value >> 1n) ^ -(value & 1n));
}
