import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../lib/auth.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get("/", async (req: AuthedRequest, res) => {
  const settings = await prisma.settings.findUnique({ where: { userId: req.userId } });
  res.json(settings);
});

const updateSchema = z.object({
  monthlyBudget: z.number().positive().optional(),
  normalSipAmount: z.number().nonnegative().optional(),
  reserveAmount: z.number().nonnegative().optional(),
  reserveExpiryMonths: z.number().int().positive().nullable().optional(),
  reserveExpiryReleasePercent: z.number().min(0).max(100).optional(),
  whatsappEnabled: z.boolean().optional(),
  notificationFrequency: z.enum(["IMMEDIATE", "GROUPED_HOURLY", "GROUPED_DAILY"]).optional(),
  groupedNotifications: z.boolean().optional(),
  pollingIntervalSeconds: z.number().int().min(10).optional(),
});

settingsRouter.put("/", async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: parsed.data,
    create: { userId: req.userId!, ...parsed.data },
  });
  res.json(settings);
});
