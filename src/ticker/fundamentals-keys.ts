/**
 * Curated metric keys for each financial statement.
 *
 * These are Yahoo's `fundamentals-timeseries` data ids (without the
 * `annual`/`quarterly` prefix, which is added per request). The lists mirror the
 * line items yfinance reports for income statements, balance sheets, and cash
 * flow statements. Returned rows use these exact key names.
 */

export const INCOME_STATEMENT_KEYS = [
  "TotalRevenue",
  "OperatingRevenue",
  "CostOfRevenue",
  "GrossProfit",
  "OperatingExpense",
  "SellingGeneralAndAdministration",
  "ResearchAndDevelopment",
  "OperatingIncome",
  "NetNonOperatingInterestIncomeExpense",
  "InterestExpense",
  "InterestIncome",
  "PretaxIncome",
  "TaxProvision",
  "NetIncomeContinuousOperations",
  "NetIncome",
  "NetIncomeCommonStockholders",
  "BasicEPS",
  "DilutedEPS",
  "BasicAverageShares",
  "DilutedAverageShares",
  "EBIT",
  "EBITDA",
  "NormalizedEBITDA",
  "TotalExpenses",
] as const;

export const BALANCE_SHEET_KEYS = [
  "TotalAssets",
  "CurrentAssets",
  "CashAndCashEquivalents",
  "CashCashEquivalentsAndShortTermInvestments",
  "Receivables",
  "Inventory",
  "OtherCurrentAssets",
  "TotalNonCurrentAssets",
  "NetPPE",
  "GoodwillAndOtherIntangibleAssets",
  "TotalLiabilitiesNetMinorityInterest",
  "CurrentLiabilities",
  "AccountsPayable",
  "CurrentDebt",
  "TotalNonCurrentLiabilitiesNetMinorityInterest",
  "LongTermDebt",
  "TotalDebt",
  "NetDebt",
  "StockholdersEquity",
  "TotalEquityGrossMinorityInterest",
  "RetainedEarnings",
  "CommonStock",
  "ShareIssued",
  "WorkingCapital",
  "TangibleBookValue",
  "InvestedCapital",
] as const;

export const CASH_FLOW_KEYS = [
  "OperatingCashFlow",
  "CashFlowFromContinuingOperatingActivities",
  "NetIncomeFromContinuingOperations",
  "DepreciationAndAmortization",
  "ChangeInWorkingCapital",
  "InvestingCashFlow",
  "CapitalExpenditure",
  "NetPPEPurchaseAndSale",
  "PurchaseOfInvestment",
  "SaleOfInvestment",
  "FinancingCashFlow",
  "RepurchaseOfCapitalStock",
  "CashDividendsPaid",
  "IssuanceOfDebt",
  "RepaymentOfDebt",
  "NetIssuancePaymentsOfDebt",
  "ChangesInCash",
  "BeginningCashPosition",
  "EndCashPosition",
  "FreeCashFlow",
] as const;

export type StatementKind = "income" | "balance" | "cashflow";

export const STATEMENT_KEYS: Record<StatementKind, readonly string[]> = {
  income: INCOME_STATEMENT_KEYS,
  balance: BALANCE_SHEET_KEYS,
  cashflow: CASH_FLOW_KEYS,
};
