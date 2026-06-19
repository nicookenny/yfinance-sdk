/**
 * Option chains via `/v7/finance/options/{symbol}`.
 *
 * Without a date the endpoint returns the nearest expiration plus the full list
 * of available expirations; with a date (epoch seconds) it returns that single
 * expiration's calls and puts.
 */
import type { YahooClient } from "../core/client.js";
import { DataError, NotFoundError } from "../core/errors.js";
import { toEpochSeconds } from "./history.js";

const OPTIONS_BASE = "https://query1.finance.yahoo.com/v7/finance/options/";

/** A single option contract (call or put). */
export interface OptionContract {
  contractSymbol: string;
  strike: number | null;
  currency: string | null;
  lastPrice: number | null;
  change: number | null;
  percentChange: number | null;
  volume: number | null;
  openInterest: number | null;
  bid: number | null;
  ask: number | null;
  contractSize: string | null;
  expiration: Date | null;
  lastTradeDate: Date | null;
  impliedVolatility: number | null;
  inTheMoney: boolean | null;
}

/** A resolved option chain for one expiration. */
export interface OptionChain {
  underlyingSymbol: string;
  expirationDate: Date | null;
  expirations: Date[];
  strikes: number[];
  calls: OptionContract[];
  puts: OptionContract[];
}

interface OptionsResponse {
  optionChain?: {
    result?: OptionsResult[] | null;
    error?: { code?: string; description?: string } | null;
  };
}

interface OptionsResult {
  underlyingSymbol?: string;
  expirationDates?: number[];
  strikes?: number[];
  options?: Array<{
    expirationDate?: number;
    calls?: RawContract[];
    puts?: RawContract[];
  }>;
}

type RawContract = Record<string, unknown>;

/** Lists available option expiration dates for a symbol. */
export async function fetchExpirations(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<Date[]> {
  const result = await request(client, symbol, undefined, signal);
  return (result.expirationDates ?? []).map(secondsToDate);
}

/** Fetches the option chain for the given (or nearest) expiration. */
export async function fetchOptionChain(
  client: YahooClient,
  symbol: string,
  date?: Date | number | string,
  signal?: AbortSignal,
): Promise<OptionChain> {
  const epoch = toEpochSeconds(date);
  const result = await request(client, symbol, epoch, signal);
  const block = result.options?.[0] ?? {};

  return {
    underlyingSymbol: result.underlyingSymbol ?? symbol,
    expirationDate:
      block.expirationDate !== undefined ? secondsToDate(block.expirationDate) : null,
    expirations: (result.expirationDates ?? []).map(secondsToDate),
    strikes: result.strikes ?? [],
    calls: (block.calls ?? []).map(toContract),
    puts: (block.puts ?? []).map(toContract),
  };
}

async function request(
  client: YahooClient,
  symbol: string,
  epochSeconds: number | undefined,
  signal: AbortSignal | undefined,
): Promise<OptionsResult> {
  const url = OPTIONS_BASE + encodeURIComponent(symbol);
  const json = await client.getJson<OptionsResponse>(url, {
    params: epochSeconds !== undefined ? { date: epochSeconds } : {},
    crumb: true,
    ...(signal ? { signal } : {}),
  });

  const err = json.optionChain?.error;
  if (err) {
    throw new DataError(
      `options error for "${symbol}": ${err.description ?? err.code ?? "unknown"}`,
    );
  }
  const result = json.optionChain?.result?.[0];
  if (!result) {
    throw new NotFoundError(`No option data for symbol "${symbol}"`, { symbol });
  }
  return result;
}

function toContract(raw: RawContract): OptionContract {
  return {
    contractSymbol: str(raw.contractSymbol) ?? "",
    strike: num(raw.strike),
    currency: str(raw.currency),
    lastPrice: num(raw.lastPrice),
    change: num(raw.change),
    percentChange: num(raw.percentChange),
    volume: num(raw.volume),
    openInterest: num(raw.openInterest),
    bid: num(raw.bid),
    ask: num(raw.ask),
    contractSize: str(raw.contractSize),
    expiration: optDate(raw.expiration),
    lastTradeDate: optDate(raw.lastTradeDate),
    impliedVolatility: num(raw.impliedVolatility),
    inTheMoney: typeof raw.inTheMoney === "boolean" ? raw.inTheMoney : null,
  };
}

function num(value: unknown): number | null {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function optDate(value: unknown): Date | null {
  return typeof value === "number" ? secondsToDate(value) : null;
}
function secondsToDate(seconds: number): Date {
  return new Date(seconds * 1000);
}
