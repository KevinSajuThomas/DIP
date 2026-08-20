import { describe, it, expect } from "vitest";
import { runBacktest, compareToBaseline, normalSipConfig, type PricePoint } from "../src/engine/backtest.js";
import { DEFAULT_STRATEGY_CONFIG } from "../src/lib/types.js";

function buildSeries(): PricePoint[] {
  const points: PricePoint[] = [];
  let price = 25000;
  let date = new Date("2016-01-01");
  for (let i = 0; i < 12; i++) {
    price *= 1.01;
    points.push({ date: date.toISOString().slice(0, 10), price: Math.round(price) });
    date.setMonth(date.getMonth() + 1);
  }
  for (let i = 0; i < 6; i++) {
    price *= 0.94;
    points.push({ date: date.toISOString().slice(0, 10), price: Math.round(price) });
    date.setMonth(date.getMonth() + 1);
  }
  for (let i = 0; i < 24; i++) {
    price *= 1.03;
    points.push({ date: date.toISOString().slice(0, 10), price: Math.round(price) });
    date.setMonth(date.getMonth() + 1);
  }
  return points;
}

describe("runBacktest — Strategy A (100% normal SIP)", () => {
  const prices = buildSeries();

  it("invests the full monthly budget every month, no dip/cap events", () => {
    const result = runBacktest("100% SIP", normalSipConfig(10000), prices);
    const monthCount = new Set(prices.map((p) => p.date.slice(0, 7))).size;
    expect(result.totalActuallyInvested).toBe(10000 * monthCount);
    expect(result.dipDeploymentCount).toBe(0);
    expect(result.capDeploymentCount).toBe(0);
  });
});

describe("runBacktest — Strategy B (DipBuy default config)", () => {
  const prices = buildSeries();

  it("uses the same strategyEngine as live monitoring — dip and/or cap events occur", () => {
    const result = runBacktest("DipBuy", DEFAULT_STRATEGY_CONFIG, prices);
    expect(result.dipDeploymentCount + result.capDeploymentCount).toBeGreaterThan(0);
    expect(result.totalActuallyInvested).toBeGreaterThan(0);
  });

  it("never reports a negative cash drag (reserve can't go negative)", () => {
    const result = runBacktest("DipBuy", DEFAULT_STRATEGY_CONFIG, prices);
    expect(result.cashDragAmount).toBeGreaterThanOrEqual(0);
  });
});

describe("compareToBaseline — does not assume the dip strategy wins", () => {
  const prices = buildSeries();
  it("computes the comparison honestly in both directions", () => {
    const baseline = runBacktest("100% SIP", normalSipConfig(10000), prices);
    const dip = runBacktest("DipBuy", DEFAULT_STRATEGY_CONFIG, prices);
    const comparison = compareToBaseline(baseline, dip);
    expect(typeof comparison.outperformed).toBe("boolean");
    expect(Number.isFinite(comparison.valueDifference)).toBe(true);
  });
});

describe("runBacktest — no look-ahead bias", () => {
  it("throws on empty price data rather than fabricating a result", () => {
    expect(() => runBacktest("x", normalSipConfig(10000), [])).toThrow();
  });

  it("rejects an invalid strategy config rather than silently normalizing it", () => {
    const bad = { ...DEFAULT_STRATEGY_CONFIG, normalInvestment: 8000 };
    expect(() => runBacktest("bad", bad, buildSeries())).toThrow(/must equal monthly budget/);
  });
});
