import Decimal from "decimal.js";
import { isThresholdCrossed } from "./drawdown.js";
import {
  calculateMonthlyCycle,
  calculateDipDeployment,
  validateStrategyConfig,
} from "./strategyEngine.js";
import type { StrategyConfig, ThresholdPercentConfig } from "../lib/types.js";

/** A single historical price point. Must be Total Return Index data when
 * available — price-return indices understate real investment returns
 * because they exclude dividends. */
export interface PricePoint {
  date: string; // ISO date, ascending order, no gaps assumed beyond what's given
  price: number;
  isTradingDay?: boolean; // defaults true; false = market closed, skip
}

export interface BacktestResult {
  strategyName: string;
  totalAllocated: number; // sum of monthlyBudget across all months
  totalActuallyInvested: number;
  finalPortfolioValue: number;
  absoluteProfit: number;
  cagrPercent: number;
  xirrPercent: number;
  maxDrawdownPercent: number;
  averagePurchasePrice: number;
  unitsAccumulated: number;
  reserveUtilizationPercent: number; // total deployed (dip+cap) / total contributed
  averageReserveSize: number;
  maxReserveObserved: number;
  dipDeploymentCount: number;
  capDeploymentCount: number;
  monthsWithReserve: number;
  cashDragAmount: number; // reserve left undeployed at the end
}

interface Purchase {
  date: string;
  amount: number;
  price: number;
  units: number;
}

/**
 * Runs Strategy A (100% normal SIP) using the same engine as everything
 * else: it is just calculateMonthlyCycle() with reserveContribution=0,
 * maxReserve effectively irrelevant. No separate formula.
 */
export function normalSipConfig(monthlyBudget: number): StrategyConfig {
  return {
    monthlyBudget,
    normalInvestment: monthlyBudget,
    reserveContribution: 0,
    maxReserve: 1, // irrelevant when reserveContribution is 0; kept > 0 to pass validation
    capRelease: 1,
    dipDeploymentMultiplier: 500,
    thresholds: [],
    primaryInstrumentSymbol: "NIFTY50",
    referenceMode: "CURRENT_CYCLE_HIGH",
    skipKeepsTimerRunning: true,
  };
}

/**
 * Runs the DipBuy strategy (or any StrategyConfig) over historical prices
 * using the SAME strategyEngine functions the live worker calls — per
 * PART 32/65, there is exactly one deterministic strategy engine, and the
 * backtester is just a driver over historical dates instead of live ticks.
 *
 * No look-ahead: the reference high at any date is derived only from
 * prices up to and including that date (PART 36).
 */
export function runBacktest(
  strategyName: string,
  config: StrategyConfig,
  prices: PricePoint[]
): BacktestResult {
  const validationErrors = validateStrategyConfig(config);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid strategy config: ${validationErrors.join(" ")}`);
  }

  const tradingDays = prices.filter((p) => p.isTradingDay !== false);
  if (tradingDays.length === 0) {
    throw new Error("No trading-day price data supplied");
  }
  const thresholds: ThresholdPercentConfig[] = config.thresholds;

  let referenceHigh = tradingDays[0].price;
  let triggeredThresholds = new Set<number>();
  let reserve = 0;
  let lastDipDeploymentDate: string | null = null;
  let dipDeploymentCount = 0;
  let capDeploymentCount = 0;
  let monthsWithReserve = 0;
  let reserveSum = 0;
  let maxReserveObserved = 0;
  let totalAllocated = new Decimal(0);
  let totalActuallyInvested = new Decimal(0);
  const purchases: Purchase[] = [];

  let peakValueSoFar = -Infinity;
  let maxDrawdownPercent = 0;

  let lastMonthKey = "";

  for (const point of tradingDays) {
    // No look-ahead: reference high uses only data up to this point.
    if (point.price > referenceHigh) {
      referenceHigh = point.price;
      triggeredThresholds = new Set();
    }

    const monthKey = point.date.slice(0, 7);
    const isNewMonth = monthKey !== lastMonthKey;
    if (isNewMonth) {
      lastMonthKey = monthKey;

      const cycle = calculateMonthlyCycle(config, reserve);
      reserve = cycle.endingReserve;
      totalAllocated = totalAllocated.plus(cycle.monthlyBudget);

      if (cycle.normalInvestment > 0) {
        purchases.push({
          date: point.date,
          amount: cycle.normalInvestment,
          price: point.price,
          units: cycle.normalInvestment / point.price,
        });
      }
      const capAmount = cycle.capDeployment + cycle.contributionDivertedToCapRelease;
      if (capAmount > 0) {
        purchases.push({
          date: point.date,
          amount: capAmount,
          price: point.price,
          units: capAmount / point.price,
        });
        capDeploymentCount += 1;
      }
      totalActuallyInvested = totalActuallyInvested.plus(cycle.totalActualInvestment);

      if (reserve > 0) monthsWithReserve += 1;
      reserveSum += reserve;
      maxReserveObserved = Math.max(maxReserveObserved, reserve);
    }

    // Market-dip gate check — thresholds only gate; deployment amount
    // comes from calculateDipDeployment(), keyed on months since last
    // deployment, exactly like the live worker. A rapid multi-threshold
    // move within one price tick collapses into a single deployment
    // keyed on the deepest newly-crossed threshold (PART 21/58).
    let deepestNewPercent: number | null = null;
    for (const t of thresholds) {
      if (triggeredThresholds.has(t.percent)) continue;
      if (isThresholdCrossed(point.price, referenceHigh, t.percent)) {
        triggeredThresholds.add(t.percent);
        if (deepestNewPercent === null || t.percent > deepestNewPercent) {
          deepestNewPercent = t.percent;
        }
      }
    }

    if (deepestNewPercent !== null && reserve > 0) {
      const monthsSince = lastDipDeploymentDate
        ? monthsBetweenDates(lastDipDeploymentDate, point.date)
        : monthsBetweenDates(tradingDays[0].date, point.date);
      const deployment = calculateDipDeployment(config, monthsSince, reserve);
      if (deployment.actualDeployment > 0) {
        purchases.push({
          date: point.date,
          amount: deployment.actualDeployment,
          price: point.price,
          units: deployment.actualDeployment / point.price,
        });
        totalActuallyInvested = totalActuallyInvested.plus(deployment.actualDeployment);
        reserve = deployment.reserveAfter;
        lastDipDeploymentDate = point.date;
        dipDeploymentCount += 1;
      }
    }

    const unitsSoFar = purchases.reduce((s, p) => s + p.units, 0);
    const valueSoFar = unitsSoFar * point.price;
    if (valueSoFar > peakValueSoFar) peakValueSoFar = valueSoFar;
    if (peakValueSoFar > 0) {
      const dd = ((valueSoFar - peakValueSoFar) / peakValueSoFar) * 100;
      if (dd < maxDrawdownPercent) maxDrawdownPercent = dd;
    }
  }

  const lastPrice = tradingDays[tradingDays.length - 1].price;
  const totalUnits = purchases.reduce((s, p) => s + p.units, 0);
  const finalPortfolioValue = totalUnits * lastPrice;
  const invested = totalActuallyInvested.toNumber();
  const absoluteProfit = finalPortfolioValue - invested;

  const firstDate = new Date(tradingDays[0].date);
  const lastDate = new Date(tradingDays[tradingDays.length - 1].date);
  const years = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const cagrPercent =
    invested > 0 && years > 0
      ? (Math.pow(finalPortfolioValue / invested, 1 / years) - 1) * 100
      : 0;

  const xirrPercent = estimateXirr(purchases, lastDate.toISOString().slice(0, 10), finalPortfolioValue);

  const monthCount = Math.max(purchases.length > 0 ? monthsWithReserveOrOne(monthsWithReserve) : 1, 1);
  const reserveContributedTotal = totalAllocated.minus(
    tradingDays.length > 0 ? config.normalInvestment * countMonths(tradingDays) : 0
  );

  return {
    strategyName,
    totalAllocated: totalAllocated.toDecimalPlaces(2).toNumber(),
    totalActuallyInvested: invested,
    finalPortfolioValue: Math.round(finalPortfolioValue * 100) / 100,
    absoluteProfit: Math.round(absoluteProfit * 100) / 100,
    cagrPercent: Math.round(cagrPercent * 100) / 100,
    xirrPercent: Math.round(xirrPercent * 100) / 100,
    maxDrawdownPercent: Math.round(maxDrawdownPercent * 100) / 100,
    averagePurchasePrice: totalUnits > 0 ? Math.round((invested / totalUnits) * 100) / 100 : 0,
    unitsAccumulated: Math.round(totalUnits * 10000) / 10000,
    reserveUtilizationPercent: 0, // computed by caller if reserve-contribution total is tracked separately
    averageReserveSize: countMonths(tradingDays) > 0 ? Math.round((reserveSum / countMonths(tradingDays)) * 100) / 100 : 0,
    maxReserveObserved: Math.round(maxReserveObserved * 100) / 100,
    dipDeploymentCount,
    capDeploymentCount,
    monthsWithReserve,
    cashDragAmount: Math.round(reserve * 100) / 100,
  };
}

function countMonths(prices: PricePoint[]): number {
  const months = new Set(prices.map((p) => p.date.slice(0, 7)));
  return months.size;
}

function monthsWithReserveOrOne(n: number): number {
  return n > 0 ? n : 1;
}

function monthsBetweenDates(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(months, 0);
}

function estimateXirr(purchases: Purchase[], asOfDate: string, finalValue: number): number {
  if (purchases.length === 0) return 0;
  const flows = purchases.map((p) => ({ date: p.date, amount: -p.amount }));
  flows.push({ date: asOfDate, amount: finalValue });

  const t0 = new Date(flows[0].date).getTime();
  const yearsFrac = (d: string) => (new Date(d).getTime() - t0) / (1000 * 60 * 60 * 24 * 365.25);

  const npv = (rate: number) =>
    flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, yearsFrac(f.date)), 0);
  const dNpv = (rate: number) =>
    flows.reduce(
      (sum, f) =>
        sum - (yearsFrac(f.date) * f.amount) / Math.pow(1 + rate, yearsFrac(f.date) + 1),
      0
    );

  let rate = 0.12;
  for (let i = 0; i < 100; i++) {
    const value = npv(rate);
    const deriv = dNpv(rate);
    if (Math.abs(deriv) < 1e-9) break;
    const next = rate - value / deriv;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-7) {
      rate = next;
      break;
    }
    rate = next;
  }
  return rate * 100;
}

export function compareToBaseline(
  baseline: BacktestResult,
  candidate: BacktestResult
): { outperformed: boolean; valueDifference: number; outperformancePercent: number } {
  const valueDifference = candidate.finalPortfolioValue - baseline.finalPortfolioValue;
  const outperformancePercent =
    baseline.finalPortfolioValue > 0
      ? (valueDifference / baseline.finalPortfolioValue) * 100
      : 0;
  return {
    outperformed: valueDifference > 0,
    valueDifference: Math.round(valueDifference * 100) / 100,
    outperformancePercent: Math.round(outperformancePercent * 100) / 100,
  };
}
