export type ReferenceHighMode =
  | "CURRENT_CYCLE_HIGH"
  | "FIFTY_TWO_WEEK_HIGH"
  | "ALL_TIME_HIGH"
  | "MANUAL";

export interface ThresholdPercentConfig {
  /** Positive number, e.g. 3 means -3%. Thresholds are gates only — they do
   * NOT determine the deployment amount. See strategyEngine.ts. */
  percent: number;
}

export interface DrawdownClassification {
  label:
    | "NORMAL_VOLATILITY"
    | "SMALL_CORRECTION"
    | "CORRECTION"
    | "MAJOR_CORRECTION"
    | "DEEP_CORRECTION"
    | "CRASH";
  description: string;
}

export interface ReferenceCycleState {
  referenceHigh: number;
  referenceHighDate: string; // ISO
  mode: ReferenceHighMode;
  /** percent values already crossed in this cycle, e.g. [3, 5] */
  triggeredThresholds: number[];
}

export interface ThresholdEvaluation {
  symbol: string;
  currentPrice: number;
  referenceHigh: number;
  drawdownPercent: number; // negative or zero
  classification: DrawdownClassification;
  newlyTriggered: ThresholdPercentConfig[];
  deepestNewlyTriggeredPercent: number | null;
  alreadyTriggered: number[];
  nextThreshold: ThresholdPercentConfig | null;
  nextTriggerPrice: number | null;
}

/** The authoritative, configurable strategy parameters. Defaults per spec. */
export interface StrategyConfig {
  monthlyBudget: number; // default 10000
  normalInvestment: number; // default 7000
  reserveContribution: number; // default 3000 — normalInvestment + reserveContribution must equal monthlyBudget
  maxReserve: number; // default 15000
  capRelease: number; // default 7000
  dipDeploymentMultiplier: number; // default 500 (rupees per elapsed month)
  thresholds: ThresholdPercentConfig[]; // default [3,5,8,10,15,20] — gates only
  primaryInstrumentSymbol: string; // default "NIFTY50"
  referenceMode: ReferenceHighMode; // default CURRENT_CYCLE_HIGH
  /** What happens to the dip-deployment timer when the user skips a dip
   * opportunity. Spec default: keep the timer running (do not reset it). */
  skipKeepsTimerRunning: boolean; // default true
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  monthlyBudget: 10000,
  normalInvestment: 7000,
  reserveContribution: 3000,
  maxReserve: 15000,
  capRelease: 7000,
  dipDeploymentMultiplier: 500,
  thresholds: [3, 5, 8, 10, 15, 20].map((percent) => ({ percent })),
  primaryInstrumentSymbol: "NIFTY50",
  referenceMode: "CURRENT_CYCLE_HIGH",
  skipKeepsTimerRunning: true,
};

/** One monthly ledger entry, per PART 17. */
export interface MonthlyCycleResult {
  monthlyBudget: number;
  normalInvestment: number;
  plannedReserveContribution: number;
  actualReserveContribution: number;
  capDeployment: number;
  totalActualInvestment: number;
  startingReserve: number;
  endingReserve: number;
  /** Amount that would have exceeded maxReserve and was diverted straight to
   * capDeployment instead of sitting in the reserve — accounted for, never
   * silently discarded. Per PART 16. */
  contributionDivertedToCapRelease: number;
}

/** A single dip-deployment calculation, per PART 10-12. */
export interface DipDeploymentResult {
  monthsSinceLastDeployment: number;
  multiplier: number;
  calculatedDeployment: number; // multiplier * monthsSinceLastDeployment, uncapped
  availableReserveBefore: number;
  actualDeployment: number; // min(calculatedDeployment, availableReserveBefore)
  reserveAfter: number;
}

export type ThresholdEventStatus =
  | "WAITING"
  | "CROSSED"
  | "ACTION_PENDING"
  | "CONFIRMED"
  | "SKIPPED"
  | "DEFERRED"
  | "FAILED";
