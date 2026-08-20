import {
  calculateDrawdownPercent,
  classifyDrawdown,
  isThresholdCrossed,
  priceForThreshold,
} from "./drawdown.js";
import type {
  ReferenceCycleState,
  ThresholdPercentConfig,
  ThresholdEvaluation,
} from "../lib/types.js";

/**
 * Evaluate a symbol's current price against its reference cycle and the
 * configured market-dip thresholds. Thresholds are GATES only — per PART 7
 * they answer only "has the market fallen enough to activate the dip
 * mechanism", they do NOT determine the deployment amount (see
 * strategyEngine.ts for that). Returns every newly-crossed threshold plus
 * the deepest one, since PART 21/58 require collapsing a rapid multi-
 * threshold move into a single strategy action keyed on the deepest level.
 */
export function evaluateThresholds(
  symbol: string,
  currentPrice: number,
  cycle: ReferenceCycleState,
  thresholds: ThresholdPercentConfig[]
): ThresholdEvaluation {
  const drawdownPercent = calculateDrawdownPercent(currentPrice, cycle.referenceHigh);
  const classification = classifyDrawdown(drawdownPercent);

  const sortedThresholds = [...thresholds].sort((a, b) => a.percent - b.percent);

  const newlyTriggered: ThresholdPercentConfig[] = [];
  for (const t of sortedThresholds) {
    const crossed = isThresholdCrossed(currentPrice, cycle.referenceHigh, t.percent);
    const alreadyMarked = cycle.triggeredThresholds.includes(t.percent);
    if (crossed && !alreadyMarked) {
      newlyTriggered.push(t);
    }
  }

  const newlyTriggeredPercents = new Set(newlyTriggered.map((t) => t.percent));
  const nextThreshold =
    sortedThresholds.find(
      (t) =>
        !cycle.triggeredThresholds.includes(t.percent) &&
        !newlyTriggeredPercents.has(t.percent)
    ) ?? null;

  const deepestNewlyTriggeredPercent =
    newlyTriggered.length > 0 ? Math.max(...newlyTriggered.map((t) => t.percent)) : null;

  return {
    symbol,
    currentPrice,
    referenceHigh: cycle.referenceHigh,
    drawdownPercent,
    classification,
    newlyTriggered,
    deepestNewlyTriggeredPercent,
    alreadyTriggered: cycle.triggeredThresholds,
    nextThreshold,
    nextTriggerPrice: nextThreshold
      ? priceForThreshold(cycle.referenceHigh, nextThreshold.percent)
      : null,
  };
}
