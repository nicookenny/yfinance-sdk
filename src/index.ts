/**
 * yahoo-finance-ts — a typed TypeScript port of yfinance for Node.js.
 *
 * Step 0 (Foundation) ships the core HTTP layer. Higher-level modules
 * (Ticker, history, financials, …) are added in subsequent steps and re-exported
 * from here.
 */
export * from "./core/index.js";
