import { describe, it, expect } from "vitest";
import { evaluateThresholds } from "../src/engine/threshold.js";
import {
  startNewCycle,
  updateCurrentCycleHigh,
  markThresholdTriggered,
} from "../src/engine/referenceCycle.js";
import type { ThresholdPercentConfig } from "../src/lib/types.js";

const thresholds: ThresholdPercentConfig[] = [3, 5, 8, 10, 15, 20].map((percent) => ({ percent }));

describe("simulation mode scenarios (PART 52)", () => {
  const cases: Array<[number, number]> = [
    [24250, 3],
    [23750, 5],
    [23000, 8],
    [22500, 10],
    [21250, 15],
    [20000, 20],
  ];

  for (const [price, expectedPercent] of cases) {
    it(`price ${price} triggers -${expectedPercent}%`, () => {
      const cycle = startNewCycle(25000, "2024-01-01", "CURRENT_CYCLE_HIGH");
      const evaluation = evaluateThresholds("NIFTY50", price, cycle, thresholds);
      const triggeredPercents = evaluation.newlyTriggered.map((t) => t.percent);
      expect(triggeredPercents).toContain(expectedPercent);
    });
  }
});

describe("threshold cooldown / duplicate-alert prevention (PART 22)", () => {
  it("does not re-trigger -10% while hovering around it repeatedly", () => {
    let cycle = startNewCycle(25000, "2024-01-01", "CURRENT_CYCLE_HIGH");
    let evaluation = evaluateThresholds("NIFTY50", 22500, cycle, thresholds);
    expect(evaluation.newlyTriggered.map((t) => t.percent)).toEqual([3, 5, 8, 10]);

    for (const t of evaluation.newlyTriggered) {
      cycle = markThresholdTriggered(cycle, t.percent);
    }

    for (const price of [22275, 22000, 22400, 22050]) {
      evaluation = evaluateThresholds("NIFTY50", price, cycle, thresholds);
      expect(evaluation.newlyTriggered).toEqual([]);
    }
  });

  it("resets triggered thresholds when a new cycle high is set", () => {
    let cycle = startNewCycle(25000, "2024-01-01", "CURRENT_CYCLE_HIGH");
    cycle = markThresholdTriggered(cycle, 3);
    cycle = markThresholdTriggered(cycle, 5);

    const afterNewHigh = updateCurrentCycleHigh(cycle, 26000, "2024-03-01");
    expect(afterNewHigh.referenceHigh).toBe(26000);
    expect(afterNewHigh.triggeredThresholds).toEqual([]);
  });
});

describe("thresholds are gates only, not deployment amounts (PART 7)", () => {
  it("ThresholdPercentConfig carries no deploymentAmount field", () => {
    const t: ThresholdPercentConfig = { percent: 5 };
    expect((t as any).deploymentAmount).toBeUndefined();
  });
});

describe("worked example — deepest threshold and next trigger", () => {
  it("produces correct drawdown, deepest trigger, and next threshold at 22500", () => {
    const cycle = startNewCycle(25000, "2024-01-01", "CURRENT_CYCLE_HIGH");
    const evaluation = evaluateThresholds("NIFTY 50", 22500, cycle, thresholds);

    expect(evaluation.drawdownPercent).toBe(-10);
    expect(evaluation.classification.label).toBe("MAJOR_CORRECTION");
    expect(evaluation.deepestNewlyTriggeredPercent).toBe(10);
    expect(evaluation.nextThreshold?.percent).toBe(15);
    expect(evaluation.nextTriggerPrice).toBe(21250);
  });
});
