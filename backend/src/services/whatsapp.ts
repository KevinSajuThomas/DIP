/**
 * Official WhatsApp Business Cloud API only. No WhatsApp Web automation,
 * no unofficial libraries, no browser automation, no scraping.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  recipientNumber: string;
  apiVersion: string; // e.g. "v20.0"
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  errorMessage?: string;
}

export class WhatsAppService {
  constructor(private readonly config: WhatsAppConfig) {}

  private get endpoint(): string {
    return `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;
  }

  async sendAlert(messageBody: string): Promise<SendResult> {
    return this.sendText(messageBody);
  }

  async sendTestMessage(): Promise<SendResult> {
    return this.sendText(
      "DipBuy test message.\n\nThis confirms your WhatsApp Business Cloud API " +
        "credentials are configured correctly. This is a test only — no threshold " +
        "has been triggered."
    );
  }

  private async sendText(body: string): Promise<SendResult> {
    if (!this.config.accessToken || !this.config.phoneNumberId || !this.config.recipientNumber) {
      return {
        ok: false,
        errorMessage:
          "WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID " +
          "and WHATSAPP_RECIPIENT_NUMBER before enabling alerts.",
      };
    }

    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: this.config.recipientNumber,
          type: "text",
          text: { body, preview_url: false },
        }),
      });

      const data = (await res.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message: string };
      };

      if (!res.ok) {
        return { ok: false, errorMessage: data.error?.message ?? `HTTP ${res.status}` };
      }
      return { ok: true, messageId: data.messages?.[0]?.id };
    } catch (err) {
      return { ok: false, errorMessage: err instanceof Error ? err.message : String(err) };
    }
  }
}

export function loadWhatsAppConfigFromEnv(): WhatsAppConfig {
  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    recipientNumber: process.env.WHATSAPP_RECIPIENT_NUMBER ?? "",
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v20.0",
  };
}

/** Formats a DIPBUY ALERT for a dip-deployment opportunity, per PART 29.
 * This alert always requires manual confirmation in the app — it never
 * claims a trade has already happened. */
export function formatDipAlert(params: {
  displayName: string;
  currentPrice: number;
  referenceHigh: number;
  drawdownPercent: number;
  thresholdPercent: number;
  reserveAvailable: number;
  monthsSinceLastDeployment: number;
  calculatedDeployment: number;
  normalInvestment: number;
  requiresConfirmation: boolean;
}): string {
  const suggestedTotal = params.normalInvestment + params.calculatedDeployment;
  const lines = [
    "DIPBUY ALERT",
    "",
    params.displayName,
    "",
    `Current: Rs ${params.currentPrice.toLocaleString("en-IN")}`,
    `Reference high: Rs ${params.referenceHigh.toLocaleString("en-IN")}`,
    `Drawdown: ${params.drawdownPercent.toFixed(2)}%`,
    "",
    `Threshold reached: -${params.thresholdPercent}%`,
    "",
    `Reserve available: Rs ${params.reserveAvailable.toLocaleString("en-IN")}`,
    `Months since last dip deployment: ${params.monthsSinceLastDeployment}`,
    "",
    `Calculated dip deployment: Rs ${params.calculatedDeployment.toLocaleString("en-IN")}`,
    "",
    `Normal investment: Rs ${params.normalInvestment.toLocaleString("en-IN")}`,
    `Suggested total investment: Rs ${suggestedTotal.toLocaleString("en-IN")}`,
    "",
    "No trade has been placed.",
  ];
  if (params.requiresConfirmation) {
    lines.push("", "ACTION REQUIRED:", "Open DipBuy to confirm or skip.");
  }
  return lines.join("\n");
}

/** Formats a DIP RESERVE CAP alert per PART 30. */
export function formatCapAlert(params: {
  reserveReached: number;
  maxReserve: number;
  capRelease: number;
  remainingReserve: number;
  normalInvestment: number;
  requiresConfirmation: boolean;
}): string {
  const totalThisCycle = params.normalInvestment + params.capRelease;
  const lines = [
    "DIP RESERVE CAP",
    "",
    `Reserve reached: Rs ${params.reserveReached.toLocaleString("en-IN")}`,
    `Maximum: Rs ${params.maxReserve.toLocaleString("en-IN")}`,
    "",
    `Automatic reserve release: Rs ${params.capRelease.toLocaleString("en-IN")}`,
    `Remaining reserve: Rs ${params.remainingReserve.toLocaleString("en-IN")}`,
    "",
    `Normal investment: Rs ${params.normalInvestment.toLocaleString("en-IN")}`,
    `Total investment this cycle: Rs ${totalThisCycle.toLocaleString("en-IN")}`,
  ];
  if (params.requiresConfirmation) {
    lines.push("", "ACTION REQUIRED:", "Open DipBuy to confirm or skip.");
  } else {
    lines.push("", "This release was applied automatically per your settings.");
  }
  return lines.join("\n");
}
