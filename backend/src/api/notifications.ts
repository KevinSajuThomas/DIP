import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../lib/auth.js";
import { WhatsAppService, loadWhatsAppConfigFromEnv } from "../services/whatsapp.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

async function getDefaultStrategyId(userId: string): Promise<string | null> {
  const strategy = await prisma.strategy.findFirst({ where: { userId, isActive: true } });
  return strategy?.id ?? null;
}

notificationsRouter.get("/", async (req: AuthedRequest, res) => {
  const strategyId = await getDefaultStrategyId(req.userId!);
  if (!strategyId) return res.json([]);
  const logs = await prisma.notification.findMany({
    where: { strategyId },
    orderBy: { sentAt: "desc" },
    take: 100,
  });
  res.json(logs);
});

notificationsRouter.post("/test", async (req: AuthedRequest, res) => {
  const strategyId = await getDefaultStrategyId(req.userId!);
  const service = new WhatsAppService(loadWhatsAppConfigFromEnv());
  const result = await service.sendTestMessage();

  let log = null;
  if (strategyId) {
    log = await prisma.notification.create({
      data: {
        strategyId,
        channel: "WHATSAPP",
        status: result.ok ? "TEST" : "FAILED",
        messageBody: "DipBuy test message. This confirms your WhatsApp Business Cloud API credentials are configured correctly. No threshold has been triggered.",
        errorMessage: result.errorMessage,
      },
    });
  }

  res.status(result.ok ? 200 : 502).json({ result, log });
});
