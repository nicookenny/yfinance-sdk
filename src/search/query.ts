/**
 * Screener query builder.
 *
 * Produces the nested `{ operator, operands }` tree Yahoo's screener expects.
 * Compose leaf comparisons with the logical `and` / `or` combinators:
 *
 * ```ts
 * import { and, gt, eq } from "yahoo-finance-ts";
 * const q = and(gt("intradaymarketcap", 1e9), eq("region", "us"));
 * ```
 */

export interface QueryNode {
  operator: string;
  operands: Array<string | number | QueryNode>;
}

type Value = string | number;

const leaf = (operator: string, field: string, ...values: Value[]): QueryNode => ({
  operator,
  operands: [field, ...values],
});

export const gt = (field: string, value: Value): QueryNode => leaf("gt", field, value);
export const lt = (field: string, value: Value): QueryNode => leaf("lt", field, value);
export const gte = (field: string, value: Value): QueryNode => leaf("gte", field, value);
export const lte = (field: string, value: Value): QueryNode => leaf("lte", field, value);
export const eq = (field: string, value: Value): QueryNode => leaf("eq", field, value);

export const btwn = (field: string, low: Value, high: Value): QueryNode =>
  leaf("btwn", field, low, high);

export const isin = (field: string, values: Value[]): QueryNode => ({
  operator: "or",
  operands: values.map((v) => eq(field, v)),
});

export const and = (...nodes: QueryNode[]): QueryNode => ({
  operator: "and",
  operands: nodes,
});

export const or = (...nodes: QueryNode[]): QueryNode => ({
  operator: "or",
  operands: nodes,
});
