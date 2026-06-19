/** Types for the domain entities: sectors, industries, and markets. */

export interface DomainOverview {
  companiesCount?: number;
  marketCap?: number;
  description?: string;
  industriesCount?: number;
  marketWeight?: number;
  employeeCount?: number;
  [key: string]: unknown;
}

export interface TopCompany {
  symbol: string;
  name?: string;
  rating?: string;
  marketWeight?: number;
}

export interface SymbolName {
  symbol: string;
  name?: string;
}

export interface IndustryRef {
  key: string;
  name?: string;
  symbol?: string;
  marketWeight?: number;
}

export interface SectorData {
  key: string;
  name?: string;
  symbol?: string;
  overview: DomainOverview;
  topCompanies: TopCompany[];
  topETFs: SymbolName[];
  topMutualFunds: SymbolName[];
  industries: IndustryRef[];
}

export interface RankedCompany {
  symbol: string;
  name?: string;
  ytdReturn?: number;
  lastPrice?: number;
  targetPrice?: number;
  growthEstimate?: number;
}

export interface IndustryData {
  key: string;
  name?: string;
  symbol?: string;
  sectorKey?: string;
  sectorName?: string;
  overview: DomainOverview;
  topCompanies: TopCompany[];
  topPerformingCompanies: RankedCompany[];
  topGrowthCompanies: RankedCompany[];
}

export interface MarketSummaryQuote {
  symbol: string;
  shortName?: string;
  fullExchangeName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
}
