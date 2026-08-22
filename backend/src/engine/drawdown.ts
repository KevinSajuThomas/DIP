import Decimal from "decimal.js";
import type { DrawdownClassification } from "../lib/types.js";

/**
 * drawdownPercent = ((currentPrice - referenceHigh) / referenceHigh) * 100
 * Always <= 0 when currentPrice <= referenceHigh. Decimal-safe.
 */
export function calculateDrawdownPercent(
  currentPrice: number,
  referenceHigh: number
): number {
  if (referenceHigh <= 0) {
    throw new Error("referenceHigh must be > 0");
  }
  const current = new Decimal(currentPrice);
  const ref = new Decimal(referenceHigh);
  const drawdown = current.minus(ref).dividedBy(ref).times(100);
  return drawdown.toDecimalPlaces(4).toNumber();
}

/**
 * Price at which a given drawdown threshold is triggered.
 * currentPrice <= referenceHigh * (1 - thresholdPercent/100)
 */
export function priceForThreshold(
  referenceHigh: number,
  thresholdPercent: number
): number {
  const ref = new Decimal(referenceHigh);
  const factor = new Decimal(1).minus(new Decimal(thresholdPercent).dividedBy(100));
  return ref.times(factor).toDecimalPlaces(4).toNumber();
}

/**
 * Whether a threshold has been crossed, using decimal-safe comparison
 * (never floating point equality).
 */
export function isThresholdCrossed(
  currentPrice: number,
  referenceHigh: number,
  thresholdPercent: number
): boolean {
  const current = new Decimal(currentPrice);
  const triggerPrice = new Decimal(priceForThreshold(referenceHigh, thresholdPercent));
  return current.lessThanOrEqualTo(triggerPrice);
}

const CLASSIFICATIONS: Array<{
  min: number; // inclusive lower bound of |drawdown|, e.g. 0
  max: number; // exclusive upper bound, Infinity for open-ended
  classification: DrawdownClassification;
}> = [
  {
    min: 0,
    max: 3,
    classification: {
      label: "NORMAL_VOLATILITY",
      description: "0% to -3%: normal market volatility.",
    },
  },
  {
    min: 3,
    max: 5,
    classification: {
      label: "SMALL_CORRECTION",
      description: "-3% to -5%: small correction.",
    },
  },
  {
    min: 5,
    max: 10,
    classification: {
      label: "CORRECTION",
      description: "-5% to -10%: correction.",
    },
  },
  {
    min: 10,
    max: 15,
    classification: {
      label: "MAJOR_CORRECTION",
      description: "-10% to -15%: major correction.",
    },
  },
  {
    min: 15,
    max: 20,
    classification: {
      label: "DEEP_CORRECTION",
      description: "-15% to -20%: deep correction.",
    },
  },
  {
    min: 20,
    max: Infinity,
    classification: {
      label: "CRASH",
      description: "Below -20%: crash / bear-market territory.",
    },
  },
];

/**
 * Classifies a drawdown percent (expected to be <= 0). Descriptive only —
 * never a prediction of future movement or recovery.
 */
export function classifyDrawdown(drawdownPercent: number): DrawdownClassification {
  const magnitude = Math.abs(Math.min(drawdownPercent, 0));
  for (const band of CLASSIFICATIONS) {
    if (magnitude >= band.min && magnitude < band.max) {
      return band.classification;
    }
  }
  // magnitude === Infinity edge case, effectively unreachable
  return CLASSIFICATIONS[CLASSIFICATIONS.length - 1].classification;
}
