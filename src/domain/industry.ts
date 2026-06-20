/** `Industry` — a market industry within a sector. */
import { YahooClient } from "../core/client.js";
import {
  fetchDomain,
  parseOverview,
  parseTopCompanies,
  parseRankedCompanies,
  str,
} from "./domain.js";
import type { IndustryData } from "./types.js";

export class Industry {
  readonly key: string;
  private readonly client: YahooClient;
  private readonly region: string;

  constructor(key: string, client?: YahooClient, region = "US") {
    if (!key.trim()) throw new Error("Industry requires a non-empty key");
    this.key = key.trim().toLowerCase();
    this.client = client ?? new YahooClient();
    this.region = region;
  }

  /** Fetches the full industry profile. */
  async fetch(signal?: AbortSignal): Promise<IndustryData> {
    const data = await fetchDomain(this.client, "industries", this.key, this.region, signal);
    const name = str(data.name);
    const symbol = str(data.symbol);
    const sectorKey = str(data.sectorKey);
    const sectorName = str(data.sectorName);
    return {
      key: this.key,
      ...(name !== undefined ? { name } : {}),
      ...(symbol !== undefined ? { symbol } : {}),
      ...(sectorKey !== undefined ? { sectorKey } : {}),
      ...(sectorName !== undefined ? { sectorName } : {}),
      overview: parseOverview(data),
      topCompanies: parseTopCompanies(data),
      topPerformingCompanies: parseRankedCompanies(data.topPerformingCompanies),
      topGrowthCompanies: parseRankedCompanies(data.topGrowthCompanies),
    };
  }
}
