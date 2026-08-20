import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../lib/auth.js";
import { evaluateThresholds } from "../engine/threshold.js";
import type { ThresholdPercentConfig } from "../lib/types.js";

export const instrumentsRouter = Router();
instrumentsRouter.use(requireAuth);

const DEFAULT_THRESHOLD_PERCENTS = [3, 5, 8, 10, 15, 20];

const createInstrumentSchema = z.object({
  symbol: z.string().min(1),
  displayName: z.string().min(1),
  category: z.enum(["CORE_BROAD_MARKET", "SECTOR_SEGMENT"]),
  initialReferenceHigh: z.number().positive(),
  useDefaultThresholds: z.boolean().default(true),
});

instrumentsRouter.get("/", async (_req, res) => {
  const instruments = await prisma.instrument.findMany({
    include: { thresholds: true, referenceCycles: { where: { isActive: true } } },
  });
  res.json(instruments);
});

instrumentsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createInstrumentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const existing = await prisma.instrument.findUnique({ where: { symbol: data.symbol } });
  if (existing) return res.status(409).json({ error: "Instrument already exists" });

  const instrument = await prisma.instrument.create({
    data: {
      symbol: data.symbol,
      displayName: data.displayName,
      category: data.category,
      thresholds: data.useDefaultThresholds
        ? { create: DEFAULT_THRESHOLD_PERCENTS.map((percent) => ({ percent })) }
        : undefined,
      referenceCycles: {
        create: {
          referenceHigh: data.initialReferenceHigh,
          referenceHighDate: new Date(),
          mode: "CURRENT_CYCLE_HIGH",
        },
      },
    },
    include: { thresholds: true, referenceCycles: true },
  });

  res.status(201).json(instrument);
});

/** PART 23/27: only the strategy's primary instrument may spend the
 * strategy's reserve. This assigns (or reassigns) that role explicitly. */
instrumentsRouter.post("/:id/set-primary", async (req: AuthedRequest, res) => {
  const strategyId = z.string().min(1).safeParse(req.body?.strategyId);
  if (!strategyId.success) return res.status(400).json({ error: "strategyId is required" });

  const instrument = await prisma.instrument.findUnique({ where: { id: req.params.id } });
  if (!instrument) return res.status(404).json({ error: "Instrument not found" });

  const updated = await prisma.instrument.update({
    where: { id: instrument.id },
    data: { primaryForStrategyId: strategyId.data },
  });
  res.json(updated);
});

instrumentsRouter.get("/:id/status", async (req: AuthedRequest, res) => {
  const instrument = await prisma.instrument.findUnique({
    where: { id: req.params.id },
    include: {
      thresholds: true,
      referenceCycles: { where: { isActive: true }, take: 1 },
      marketSnapshots: { orderBy: { fetchedAt: "desc" }, take: 1 },
    },
  });
  if (!instrument) return res.status(404).json({ error: "Instrument not found" });

  const cycle = instrument.referenceCycles[0];
  const latestQuote = instrument.marketSnapshots[0];
  if (!cycle || !latestQuote) {
    return res.status(409).json({ error: "No active reference cycle or quote yet" });
  }

  const triggeredEvents = await prisma.thresholdEvent.findMany({
    where: { referenceCycleId: cycle.id },
  });

  const thresholds: ThresholdPercentConfig[] = instrument.thresholds.map(
    (t: { percent: unknown }) => ({ percent: Number(t.percent) })
  );

  const evaluation = evaluateThresholds(
    instrument.symbol,
    Number(latestQuote.price),
    {
      referenceHigh: Number(cycle.referenceHigh),
      referenceHighDate: cycle.referenceHighDate.toISOString(),
      mode: cycle.mode as any,
      triggeredThresholds: triggeredEvents.map((e: { thresholdPercent: unknown }) => Number(e.thresholdPercent)),
    },
    thresholds
  );

  res.json({
    instrument: { id: instrument.id, symbol: instrument.symbol, displayName: instrument.displayName },
    quote: { price: Number(latestQuote.price), fetchedAt: latestQuote.fetchedAt, isStale: latestQuote.isStale },
    evaluation,
  });
});

instrumentsRouter.get("/:id/thresholds", async (req: AuthedRequest, res) => {
  const instrument = await prisma.instrument.findUnique({ where: { id: req.params.id } });
  if (!instrument) return res.status(404).json({ error: "Instrument not found" });
  const thresholds = await prisma.threshold.findMany({ where: { instrumentId: instrument.id } });
  res.json(thresholds);
});

const setThresholdsSchema = z.object({
  thresholds: z.array(z.object({ percent: z.number().positive(), alertsEnabled: z.boolean().default(true) })),
});

instrumentsRouter.post("/:id/thresholds", async (req: AuthedRequest, res) => {
  const instrument = await prisma.instrument.findUnique({ where: { id: req.params.id } });
  if (!instrument) return res.status(404).json({ error: "Instrument not found" });

  const parsed = setThresholdsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await prisma.$transaction([
    prisma.threshold.deleteMany({ where: { instrumentId: instrument.id } }),
    prisma.threshold.createMany({
      data: parsed.data.thresholds.map((t) => ({ ...t, instrumentId: instrument.id })),
    }),
  ]);

  const thresholds = await prisma.threshold.findMany({ where: { instrumentId: instrument.id } });
  res.json(thresholds);
});

instrumentsRouter.post("/:id/reset-cycle", async (req: AuthedRequest, res) => {
  const instrument = await prisma.instrument.findUnique({ where: { id: req.params.id } });
  if (!instrument) return res.status(404).json({ error: "Instrument not found" });

  const body = z.object({ referenceHigh: z.number().positive() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const [, newCycle] = await prisma.$transaction([
    prisma.referenceCycle.updateMany({
      where: { instrumentId: instrument.id, isActive: true },
      data: { isActive: false, closedAt: new Date() },
    }),
    prisma.referenceCycle.create({
      data: {
        instrumentId: instrument.id,
        referenceHigh: body.data.referenceHigh,
        referenceHighDate: new Date(),
        mode: "CURRENT_CYCLE_HIGH",
      },
    }),
  ]);

  res.json(newCycle);
});
