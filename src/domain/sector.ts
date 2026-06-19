/** `Sector` — a Yahoo Finance sector (e.g. "technology"). */
import { YahooClient } from "../core/client.js";
import {
  fetchDomain,
  parseOverview,
  parseTopCompanies,
  parseSymbolNames,
  asArray,
  clean,
  str,
  num,
} from "./domain.js";
import type { IndustryRef, SectorData } from "./types.js";

export class Sector {
  readonly key: string;
  private readonly client: YahooClient;
  private readonly region: string;

  constructor(key: string, client?: YahooClient, region = "US") {
    if (!key.trim()) throw new Error("Sector requires a non-empty key");
    this.key = key.trim().toLowerCase();
    this.client = client ?? new YahooClient();
    this.region = region;
  }

  /** Fetches the full sector profile. */
  async fetch(signal?: AbortSignal): Promise<SectorData> {
    const data = await fetchDomain(this.client, "sectors", this.key, this.region, signal);
    const name = str(data.name);
    const symbol = str(data.symbol);
    return {
      key: this.key,
      ...(name !== undefined ? { name } : {}),
      ...(symbol !== undefined ? { symbol } : {}),
      overview: parseOverview(data),
      topCompanies: parseTopCompanies(data),
      topETFs: parseSymbolNames(data.topETFs),
      topMutualFunds: parseSymbolNames(data.topMutualFunds),
      industries: asArray(data.industries).map((i) => {
        const r = i as Record<string, unknown>;
        return clean<IndustryRef>({
          key: str(r.key) ?? "",
          name: str(r.name),
          symbol: str(r.symbol),
          marketWeight: num(r.marketWeight),
        });
      }),
    };
  }
}
