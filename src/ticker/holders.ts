/**
 * Ownership data: major holders, institutions, funds, and insiders.
 *
 * All of this lives in `quoteSummary` modules; this module fetches them and
 * reshapes each into a flat typed array (or object) with epoch dates surfaced
 * as `Date`.
 */
import type { YahooClient } from "../core/client.js";
import { fetchQuoteSummary } from "./quote.js";

/** Aggregate ownership percentages. */
export interface MajorHolders {
  insidersPercentHeld?: number;
  institutionsPercentHeld?: number;
  institutionsFloatPercentHeld?: number;
  institutionsCount?: number;
}

/** One institutional or mutual-fund holder. */
export interface InstitutionalHolder {
  organization: string;
  reportDate?: Date;
  pctHeld?: number;
  position?: number;
  value?: number;
  pctChange?: number;
}

/** One insider transaction. */
export interface InsiderTransaction {
  filerName: string;
  transactionText?: string;
  position?: string;
  startDate?: Date;
  shares?: number;
  value?: number;
  ownership?: string;
}

/** One insider on the roster. */
export interface InsiderRosterMember {
  name: string;
  relation?: string;
  positionDirect?: number;
  positionDirectDate?: Date;
  latestTransDate?: Date;
}

export async function fetchMajorHolders(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<MajorHolders> {
  const s = await fetchQuoteSummary(client, symbol, ["majorHoldersBreakdown"], signal);
  const b = (s.majorHoldersBreakdown ?? {}) as Record<string, unknown>;
  return cleanObj({
    insidersPercentHeld: num(b.insidersPercentHeld),
    institutionsPercentHeld: num(b.institutionsPercentHeld),
    institutionsFloatPercentHeld: num(b.institutionsFloatPercentHeld),
    institutionsCount: num(b.institutionsCount),
  });
}

export async function fetchInstitutionalHolders(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<InstitutionalHolder[]> {
  const s = await fetchQuoteSummary(client, symbol, ["institutionOwnership"], signal);
  return mapHolders((s.institutionOwnership as Record<string, unknown>)?.ownershipList);
}

export async function fetchMutualFundHolders(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<InstitutionalHolder[]> {
  const s = await fetchQuoteSummary(client, symbol, ["fundOwnership"], signal);
  return mapHolders((s.fundOwnership as Record<string, unknown>)?.ownershipList);
}

export async function fetchInsiderTransactions(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<InsiderTransaction[]> {
  const s = await fetchQuoteSummary(client, symbol, ["insiderTransactions"], signal);
  const list = asArray((s.insiderTransactions as Record<string, unknown>)?.transactions);
  return list.map((raw) => {
    const r = raw as Record<string, unknown>;
    return cleanObj<InsiderTransaction>({
      filerName: str(r.filerName) ?? "",
      transactionText: str(r.transactionText),
      position: str(r.position),
      startDate: optDate(r.startDate),
      shares: num(r.shares),
      value: num(r.value),
      ownership: str(r.ownership),
    });
  });
}

export async function fetchInsiderRoster(
  client: YahooClient,
  symbol: string,
  signal?: AbortSignal,
): Promise<InsiderRosterMember[]> {
  const s = await fetchQuoteSummary(client, symbol, ["insiderHolders"], signal);
  const list = asArray((s.insiderHolders as Record<string, unknown>)?.holders);
  return list.map((raw) => {
    const r = raw as Record<string, unknown>;
    return cleanObj<InsiderRosterMember>({
      name: str(r.name) ?? "",
      relation: str(r.relation),
      positionDirect: num(r.positionDirect),
      positionDirectDate: optDate(r.positionDirectDate),
      latestTransDate: optDate(r.latestTransDate),
    });
  });
}

function mapHolders(list: unknown): InstitutionalHolder[] {
  return asArray(list).map((raw) => {
    const r = raw as Record<string, unknown>;
    return cleanObj<InstitutionalHolder>({
      organization: str(r.organization) ?? "",
      reportDate: optDate(r.reportDate),
      pctHeld: num(r.pctHeld),
      position: num(r.position),
      value: num(r.value),
      pctChange: num(r.pctChange),
    });
  });
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
}
function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function optDate(value: unknown): Date | undefined {
  return typeof value === "number" ? new Date(value * 1000) : undefined;
}
function cleanObj<T>(obj: Record<string, unknown>): T {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj as T;
}
