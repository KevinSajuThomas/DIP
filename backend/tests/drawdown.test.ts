import { describe, it, expect } from "vitest";
import {
  calculateDrawdownPercent,
  classifyDrawdown,
  isThresholdCrossed,
  priceForThreshold,
} from "../src/engine/drawdown.js";

describe("calculateDrawdownPercent", () => {
  it("matches the spec worked example: 25000 -> 23750 = -5%", () => {
    expect(calculateDrawdownPercent(23750, 25000)).toBe(-5);
  });

  it("returns 0 at the reference high", () => {
    expect(calculateDrawdownPercent(25000, 25000)).toBe(0);
  });
});

describe("priceForThreshold", () => {
  it("matches all worked threshold prices for ref high 25000", () => {
    expect(priceForThreshold(25000, 3)).toBe(24250);
    expect(priceForThreshold(25000, 5)).toBe(23750);
    expect(priceForThreshold(25000, 8)).toBe(23000);
    expect(priceForThreshold(25000, 10)).toBe(22500);
    expect(priceForThreshold(25000, 15)).toBe(21250);
    expect(priceForThreshold(25000, 20)).toBe(20000);
  });
});

describe("isThresholdCrossed", () => {
  it("is not crossed just above the trigger price", () => {
    expect(isThresholdCrossed(24300, 25000, 3)).toBe(false);
  });
  it("is crossed exactly at the trigger price (no float equality bugs)", () => {
    expect(isThresholdCrossed(24250, 25000, 3)).toBe(true);
  });
  it("is crossed below the trigger price", () => {
    expect(isThresholdCrossed(23750, 25000, 5)).toBe(true);
  });
});

describe("classifyDrawdown", () => {
  it("classifies each band per spec", () => {
    expect(classifyDrawdown(-1).label).toBe("NORMAL_VOLATILITY");
    expect(classifyDrawdown(-3).label).toBe("SMALL_CORRECTION");
    expect(classifyDrawdown(-4.9).label).toBe("SMALL_CORRECTION");
    expect(classifyDrawdown(-5).label).toBe("CORRECTION");
    expect(classifyDrawdown(-9.9).label).toBe("CORRECTION");
    expect(classifyDrawdown(-10).label).toBe("MAJOR_CORRECTION");
    expect(classifyDrawdown(-15).label).toBe("DEEP_CORRECTION");
    expect(classifyDrawdown(-20).label).toBe("CRASH");
    expect(classifyDrawdown(-35).label).toBe("CRASH");
  });
});
