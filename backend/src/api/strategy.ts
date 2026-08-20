import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../lib/auth.js";
import { validateStrategyConfig } from "../engine/strategyEngine.js";
import { DEFAULT_STRATEGY_CONFIG } from "../lib/types.js";
import type { StrategyConfig } from "../lib/types.js";

export const strategyRouter = Router();
strategyRouter.use(requireAuth);

/** PART 47: version 1 creates exactly one default strategy per user,
 * "NIFTY 50 DipBuy", on first access — idempotent (findFirst-or-create). */
async function getOrCreateDefaultStrategy(userId: string) {
  let strategy = await prisma.strategy.findFirst({
    where: { userId, isActive: true },
    include: { settings: true, primaryInstrument: true },
  });
  if (strategy) return strategy;

  strategy = await prisma.strategy.create({
    data: {
      userId,
      name: "NIFTY 50 DipBuy",
      settings: {
        create: {
          monthlyBudget: DEFAULT_STRATEGY_CONFIG.monthlyBudget,
          normalInvestment: DEFAULT_STRATEGY_CONFIG.normalInvestment,
          reserveContribution: DEFAULT_STRATEGY_CONFIG.reserveContribution,
          maxReserve: DEFAULT_STRATEGY_CONFIG.maxReserve,
          capRelease: DEFAULT_STRATEGY_CONFIG.capRelease,
          dipDeploymentMultiplier: DEFAULT_STRATEGY_CONFIG.dipDeploymentMultiplier,
        },
      },
    },
    include: { settings: true, primaryInstrument: true },
  });
  return strategy;
}

strategyRouter.get("/", async (req: AuthedRequest, res) => {
  const strategy = await getOrCreateDefaultStrategy(req.userId!);
  res.json(strategy);
});

const updateSettingsSchema = z.object({
  monthlyBudget: z.number().positive(),
  normalInvestment: z.number().nonnegative(),
  reserveContribution: z.number().nonnegative(),
  maxReserve: z.number().positive(),
  capRelease: z.number().positive(),
  dipDeploymentMultiplier: z.number().positive(),
  whatsappEnabled: z.boolean().optional(),
  pollingIntervalSeconds: z.number().int().min(10).optional(),
});

/** PART 43/44: rejects any config where normalInvestment + reserveContribution
 * != monthlyBudget, using the SAME validator the engine uses. */
strategyRouter.put("/settings", async (req: AuthedRequest, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const candidate: StrategyConfig = {
    ...DEFAULT_STRATEGY_CONFIG,
    ...parsed.data,
  };
  const errors = validateStrategyConfig(candidate);
  if (errors.length > 0) return res.status(400).json({ error: errors });

  const strategy = await getOrCreateDefaultStrategy(req.userId!);
  const settings = await prisma.strategySettings.update({
    where: { strategyId: strategy.id },
    data: parsed.data,
  });

  await prisma.auditLog.create({
    data: {
      strategyId: strategy.id,
      eventType: "CONFIG_CHANGE",
      summary: `Strategy settings updated: budget Rs ${settings.monthlyBudget}, normal Rs ${settings.normalInvestment}, reserve Rs ${settings.reserveContribution}`,
      detailsJson: JSON.stringify(settings),
    },
  });

  res.json(settings);
});

strategyRouter.get("/investment-cycles", async (req: AuthedRequest, res) => {
  const strategy = await getOrCreateDefaultStrategy(req.userId!);
  const cycles = await prisma.investmentCycle.findMany({
    where: { strategyId: strategy.id },
    orderBy: { cycleMonth: "desc" },
  });
  res.json(cycles);
});

strategyRouter.get("/reserve-ledger", async (req: AuthedRequest, res) => {
  const strategy = await getOrCreateDefaultStrategy(req.userId!);
  const entries = await prisma.reserveLedgerEntry.findMany({
    where: { strategyId: strategy.id },
    orderBy: { createdAt: "desc" },
  });
  const balance = entries[0] ? Number(entries[0].balanceAfter) : 0;
  res.json({ balance, entries });
});

strategyRouter.get("/audit-log", async (req: AuthedRequest, res) => {
  const strategy = await getOrCreateDefaultStrategy(req.userId!);
  const logs = await prisma.auditLog.findMany({
    where: { strategyId: strategy.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(logs);
});

strategyRouter.get("/threshold-events", async (req: AuthedRequest, res) => {
  const strategy = await getOrCreateDefaultStrategy(req.userId!);
  const events = await prisma.thresholdEvent.findMany({
    where: { strategyId: strategy.id },
    orderBy: { triggeredAt: "desc" },
  });
  res.json(events);
});

/** PART 19/20/27: the confirm/skip workflow. Money only "moves" (i.e. gets
 * recorded as an actual investment and deducted from the reserve) after
 * this endpoint is called with CONFIRM — never automatically from the
 * worker. SKIP records the skip and, per skipKeepsTimerRunning default,
 * leaves the dip-deployment timer untouched (PART 20). */
const resolveEventSchema = z.object({ action: z.enum(["CONFIRM", "SKIP", "DEFER"]) });

strategyRouter.post("/threshold-events/:id/resolve", async (req: AuthedRequest, res) => {
  const parsed = resolveEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const event = await prisma.thresholdEvent.findUnique({ where: { id: req.params.id } });
  if (!event) return res.status(404).json({ error: "Threshold event not found" });
  if (!event.isDeepestInBatch) {
    return res.status(400).json({ error: "Only the deepest threshold in a batch carries a deployment decision" });
  }
  if (event.status !== "ACTION_PENDING") {
    return res.status(409).json({ error: `Event is already ${event.status}, cannot resolve again` });
  }

  const strategy = await prisma.strategy.findUnique({ where: { id: event.strategyId } });
  if (!strategy) return res.status(404).json({ error: "Strategy not found" });

  if (parsed.data.action === "SKIP") {
    const updated = await prisma.thresholdEvent.update({
      where: { id: event.id },
      data: { status: "SKIPPED", resolvedAt: new Date(), actualDeployment: 0 },
    });
    await prisma.auditLog.create({
      data: {
        strategyId: strategy.id,
        eventType: "SKIP",
        summary: `Dip opportunity at -${event.thresholdPercent}% skipped. Reserve unchanged, timer keeps running.`,
        detailsJson: JSON.stringify({ eventId: event.id }),
      },
    });
    return res.json(updated);
  }

  if (parsed.data.action === "DEFER") {
    const updated = await prisma.thresholdEvent.update({
      where: { id: event.id },
      data: { status: "DEFERRED", resolvedAt: new Date() },
    });
    return res.json(updated);
  }

  // CONFIRM — this is the only path that actually moves the reserve and
  // records an investment.
  const lastReserveEntry = await prisma.reserveLedgerEntry.findFirst({
    where: { strategyId: strategy.id },
    orderBy: { createdAt: "desc" },
  });
  const availableReserve = lastReserveEntry ? Number(lastReserveEntry.balanceAfter) : 0;
  const actualDeployment = Math.min(Number(event.calculatedDeployment ?? 0), availableReserve);
  const reserveAfter = availableReserve - actualDeployment;

  const [updatedEvent] = await prisma.$transaction([
    prisma.thresholdEvent.update({
      where: { id: event.id },
      data: {
        status: "CONFIRMED",
        resolvedAt: new Date(),
        actualDeployment,
        reserveAfter,
      },
    }),
    prisma.reserveLedgerEntry.create({
      data: {
        strategyId: strategy.id,
        entryType: "DIP_DEPLOYMENT",
        amount: -actualDeployment,
        balanceAfter: reserveAfter,
        thresholdEventId: event.id,
      },
    }),
    prisma.transaction.create({
      data: {
        strategyId: strategy.id,
        thresholdEventId: event.id,
        type: "DIP_DEPLOYMENT",
        amount: actualDeployment,
        instrument: event.instrumentId,
        date: new Date(),
        status: "CONFIRMED",
      },
    }),
    prisma.auditLog.create({
      data: {
        strategyId: strategy.id,
        eventType: "CONFIRMATION",
        summary: `Dip deployment confirmed: Rs ${actualDeployment} deployed at -${event.thresholdPercent}%. Reserve Rs ${availableReserve} -> Rs ${reserveAfter}.`,
        detailsJson: JSON.stringify({ eventId: event.id, actualDeployment, reserveAfter }),
      },
    }),
  ]);

  res.json(updatedEvent);
});
