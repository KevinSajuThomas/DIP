import { describe, it, expect } from "vitest";
import { formatDipAlert, formatCapAlert, WhatsAppService } from "../src/services/whatsapp.js";

describe("formatDipAlert", () => {
  it("matches the PART 29 worked example fields and never claims a trade happened", () => {
    const msg = formatDipAlert({
      displayName: "NIFTY 50",
      currentPrice: 23750,
      referenceHigh: 25000,
      drawdownPercent: -5,
      thresholdPercent: 5,
      reserveAvailable: 12000,
      monthsSinceLastDeployment: 4,
      calculatedDeployment: 2000,
      normalInvestment: 7000,
      requiresConfirmation: true,
    });
    expect(msg).toContain("DIPBUY ALERT");
    expect(msg).toContain("Threshold reached: -5%");
    expect(msg).toContain("Months since last dip deployment: 4");
    expect(msg).toContain("Calculated dip deployment: Rs 2,000");
    expect(msg).toContain("Suggested total investment: Rs 9,000");
    expect(msg).toContain("No trade has been placed.");
    expect(msg).toContain("ACTION REQUIRED");
  });

  it("omits ACTION REQUIRED when confirmation is not required", () => {
    const msg = formatDipAlert({
      displayName: "NIFTY 50",
      currentPrice: 23750,
      referenceHigh: 25000,
      drawdownPercent: -5,
      thresholdPercent: 5,
      reserveAvailable: 12000,
      monthsSinceLastDeployment: 4,
      calculatedDeployment: 2000,
      normalInvestment: 7000,
      requiresConfirmation: false,
    });
    expect(msg).not.toContain("ACTION REQUIRED");
  });
});

describe("formatCapAlert", () => {
  it("matches the PART 30 worked example", () => {
    const msg = formatCapAlert({
      reserveReached: 15000,
      maxReserve: 15000,
      capRelease: 7000,
      remainingReserve: 8000,
      normalInvestment: 7000,
      requiresConfirmation: false,
    });
    expect(msg).toContain("DIP RESERVE CAP");
    expect(msg).toContain("Reserve reached: Rs 15,000");
    expect(msg).toContain("Automatic reserve release: Rs 7,000");
    expect(msg).toContain("Remaining reserve: Rs 8,000");
    expect(msg).toContain("Total investment this cycle: Rs 14,000");
  });
});

describe("WhatsAppService", () => {
  it("fails safely (never fabricates success) when not configured", async () => {
    const service = new WhatsAppService({
      accessToken: "",
      phoneNumberId: "",
      recipientNumber: "",
      apiVersion: "v20.0",
    });
    const result = await service.sendTestMessage();
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/not configured/i);
  });
});
