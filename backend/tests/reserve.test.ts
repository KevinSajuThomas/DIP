import { describe, it, expect } from "vitest";
import {
  summarizeReserve,
  suggestedDeployment,
  calculateCashDragRelease,
  type ReserveContribution,
} from "../src/engine/reserve.js";

describe("summarizeReserve", () => {
  it("matches spec worked example: 3000 contributed, 500 deployed -> 2500 available", () => {
    const contributions: ReserveContribution[] = [
      { id: "c1", amount: 3000, contributedAtIso: "2024-01-01", deployedAmount: 500 },
    ];
    const summary = summarizeReserve(contributions, "2024-02-01");
    expect(summary.available).toBe(2500);
  });
});

describe("suggestedDeployment", () => {
  it("never suggests more than what's available", () => {
    expect(suggestedDeployment(500, 300)).toBe(300);
    expect(suggestedDeployment(500, 1000)).toBe(500);
    expect(suggestedDeployment(500, 0)).toBe(0);
  });
});

describe("calculateCashDragRelease", () => {
  it("is disabled when expiryMonths is null", () => {
    const contributions: ReserveContribution[] = [
      { id: "c1", amount: 1000, contributedAtIso: "2020-01-01", deployedAmount: 0 },
    ];
    expect(calculateCashDragRelease(contributions, "2025-01-01", null, 25)).toEqual([]);
  });

  it("releases 25% of remaining balance for contributions older than 12 months", () => {
    const contributions: ReserveContribution[] = [
      { id: "old", amount: 1000, contributedAtIso: "2023-01-01", deployedAmount: 0 },
      { id: "fresh", amount: 1000, contributedAtIso: "2024-11-01", deployedAmount: 0 },
    ];
    const releases = calculateCashDragRelease(contributions, "2024-06-01", 12, 25);
    expect(releases).toHaveLength(1);
    expect(releases[0].contributionId).toBe("old");
    expect(releases[0].releaseAmount).toBe(250);
  });
});
