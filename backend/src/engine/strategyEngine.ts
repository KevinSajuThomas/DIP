import Decimal from "decimal.js";
import type { DipDeploymentResult, MonthlyCycleResult, StrategyConfig } from "../lib/types.js";

/**
 * Validates that normalInvestment + reserveContribution === monthlyBudget,
 * per PART 43/44. Callers must reject invalid configs before they reach
 * the engine — the engine itself also refuses to run against one, since it
 * is the authoritative source (PART 65) and must never silently normalize
 * a bad config.
 */
export function validateStrategyConfig(config: StrategyConfig): string[] {
  const errors: string[] = [];
  const sum = new Decimal(config.normalInvestment).plus(config.reserveContribution);
  if (!sum.equals(config.monthlyBudget)) {
    errors.push(
      `Normal investment (${config.normalInvestment}) + reserve contribution (${config.reserveContribution}) ` +
        `must equal monthly budget (${config.monthlyBudget}).`
    );
  }
  if (config.maxReserve <= 0) errors.push("Maximum reserve must be greater than 0.");
  if (config.capRelease <= 0) errors.push("Cap release must be greater than 0.");
  if (config.capRelease > config.maxReserve) {
    errors.push("Cap release cannot exceed the maximum reserve.");
  }
  if (config.dipDeploymentMultiplier <= 0) {
    errors.push("Dip deployment multiplier must be greater than 0.");
  }
  return errors;
}

/**
 * Runs one ordinary monthly cycle: invest the normal amount, add the
 * planned reserve contribution, and — if that contribution would push the
 * reserve above maxReserve — divert exactly the overflow into the cap
 * release path instead of losing it (PART 5, 6, 16, 17).
 *
 * This function does NOT handle a market-dip deployment in the same
 * month — dip deployments are calculated separately via
 * calculateDipDeployment() and then reconciled against the reserve by the
 * caller (worker/backtester) using applyDipDeployment(), because a dip can
 * occur independently of the monthly cycle boundary. The two mechanisms
 * "must not interfere with each other's accounting" (PART 15), so this
 * function only ever performs the reserve-cap release, never a dip
 * deployment.
 */
export function calculateMonthlyCycle(
  config: StrategyConfig,
  startingReserve: number
): MonthlyCycleResult {
  const plannedReserveContribution = new Decimal(config.reserveContribution);
  const reserveAfterPlannedContribution = new Decimal(startingReserve).plus(
    plannedReserveContribution
  );

  let actualReserveContribution = plannedReserveContribution;
  let contributionDivertedToCapRelease = new Decimal(0);
  let endingReserveBeforeCapCheck = reserveAfterPlannedContribution;

  // PART 16: if the planned contribution would push the reserve past the
  // cap, only the amount up to the cap is actually retained in the
  // reserve — the overflow becomes part of this cycle's investment, not a
  // silently discarded rupee.
  if (reserveAfterPlannedContribution.greaterThan(config.maxReserve)) {
    const room = Decimal.max(new Decimal(config.maxReserve).minus(startingReserve), 0);
    actualReserveContribution = room;
    contributionDivertedToCapRelease = plannedReserveContribution.minus(room);
    endingReserveBeforeCapCheck = new Decimal(startingReserve).plus(room);
  }

  // PART 5/6: once the reserve sits at or above the cap, release capRelease
  // from it (in addition to any diverted contribution above).
  let capDeployment = new Decimal(0);
  let endingReserve = endingReserveBeforeCapCheck;
  if (endingReserveBeforeCapCheck.greaterThanOrEqualTo(config.maxReserve)) {
    capDeployment = Decimal.min(config.capRelease, endingReserveBeforeCapCheck);
    endingReserve = endingReserveBeforeCapCheck.minus(capDeployment);
  }

  const totalActualInvestment = new Decimal(config.normalInvestment)
    .plus(capDeployment)
    .plus(contributionDivertedToCapRelease);

  return {
    monthlyBudget: config.monthlyBudget,
    normalInvestment: config.normalInvestment,
    plannedReserveContribution: plannedReserveContribution.toNumber(),
    actualReserveContribution: actualReserveContribution.toDecimalPlaces(2).toNumber(),
    capDeployment: capDeployment.toDecimalPlaces(2).toNumber(),
    totalActualInvestment: totalActualInvestment.toDecimalPlaces(2).toNumber(),
    startingReserve,
    endingReserve: endingReserve.toDecimalPlaces(2).toNumber(),
    contributionDivertedToCapRelease: contributionDivertedToCapRelease
      .toDecimalPlaces(2)
      .toNumber(),
  };
}

/**
 * Calculates a dip deployment when a market threshold has been crossed.
 * PART 10: dipDeployment = multiplier × monthsSinceLastDipDeployment,
 * capped by whatever reserve is actually available (PART 55 — never
 * negative, never more than what's there).
 */
export function calculateDipDeployment(
  config: StrategyConfig,
  monthsSinceLastDeployment: number,
  availableReserve: number
): DipDeploymentResult {
  const calculatedDeployment = new Decimal(config.dipDeploymentMultiplier).times(
    Math.max(monthsSinceLastDeployment, 0)
  );
  const availableReserveBefore = Math.max(availableReserve, 0);
  const actualDeployment = Decimal.min(calculatedDeployment, availableReserveBefore);
  const reserveAfter = new Decimal(availableReserveBefore).minus(actualDeployment);

  return {
    monthsSinceLastDeployment,
    multiplier: config.dipDeploymentMultiplier,
    calculatedDeployment: calculatedDeployment.toDecimalPlaces(2).toNumber(),
    availableReserveBefore,
    actualDeployment: actualDeployment.toDecimalPlaces(2).toNumber(),
    reserveAfter: reserveAfter.toDecimalPlaces(2).toNumber(),
  };
}

/**
 * Whole-months elapsed between two ISO dates. Used for
 * monthsSinceLastDeployment — floors to whole months so a deployment
 * cannot be "topped up" by a fraction of a month per PART 10-12's worked
 * examples (all integer month counts).
 */
export function monthsElapsed(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(months, 0);
}
