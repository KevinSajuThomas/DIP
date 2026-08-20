import Decimal from "decimal.js";
import type { ReferenceCycleState, ReferenceHighMode } from "../lib/types.js";

/**
 * Given the current cycle state and a new price observation, decide whether
 * a new reference-high cycle should start (current-cycle-high mode only).
 *
 * Rule: if the new price exceeds the existing reference high, the old cycle
 * is closed and a brand new cycle begins with all thresholds reset — this
 * matches "if a new cycle high is established, create a new reference cycle
 * and reset the threshold states."
 */
export function updateCurrentCycleHigh(
  state: ReferenceCycleState,
  newPrice: number,
  observedAtIso: string
): ReferenceCycleState {
  if (state.mode !== "CURRENT_CYCLE_HIGH") {
    return state;
  }
  const isNewHigh = new Decimal(newPrice).greaterThan(state.referenceHigh);
  if (!isNewHigh) {
    return state;
  }
  return {
    referenceHigh: newPrice,
    referenceHighDate: observedAtIso,
    mode: state.mode,
    triggeredThresholds: [],
  };
}

export function startNewCycle(
  referenceHigh: number,
  observedAtIso: string,
  mode: ReferenceHighMode
): ReferenceCycleState {
  return {
    referenceHigh,
    referenceHighDate: observedAtIso,
    mode,
    triggeredThresholds: [],
  };
}

export function markThresholdTriggered(
  state: ReferenceCycleState,
  thresholdPercent: number
): ReferenceCycleState {
  if (state.triggeredThresholds.includes(thresholdPercent)) {
    return state;
  }
  return {
    ...state,
    triggeredThresholds: [...state.triggeredThresholds, thresholdPercent].sort(
      (a, b) => a - b
    ),
  };
}
