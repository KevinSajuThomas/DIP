import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../lib/auth.js";

export const portfolioRouter = Router();
portfolioRouter.use(requireAuth);

async function getDefaultStrategyId(userId: string): Promise<string | null> {
  const strategy = await prisma.strategy.findFirst({ where: { userId, isActive: true } });
  return strategy?.id ?? null;
}

const filterSchema = z.object({
  type: z.enum(["ALL", "NORMAL_INVESTMENT", "DIP_DEPLOYMENT", "CAP_DEPLOYMENT"]).optional(),
});

/** PART 41: totals plus filterable transaction list. PART 18: planned
 * reserve is shown distinctly from actual broker cash — this app has no
 * broker write access, so "actual broker cash" is always reported as
 * unavailable rather than assumed. */
portfolioRouter.get("/", async (req: AuthedRequest, res) => {
  const parsed = filterSchema.safeParse(req.query);
  const filterType = parsed.success ? parsed.data.type : undefined;

  const strategyId = await getDefaultStrategyId(req.userId!);
  if (!strategyId) return res.json({ totalInvested: 0, transactions: [], reserve: { available: 0 } });

  const transactions = await prisma.transaction.findMany({
    where: {
      strategyId,
      status: { in: ["RECORDED", "CONFIRMED"] },
      ...(filterType && filterType !== "ALL" ? { type: filterType } : {}),
    },
    orderBy: { date: "desc" },
  });

  let totalInvested = 0;
  const unitsBySymbol: Record<string, number> = {};
  const amountBySymbol: Record<string, number> = {};
  for (const t of transactions) {
    totalInvested += Number(t.amount);
    if (t.units) {
      unitsBySymbol[t.instrument] = (unitsBySymbol[t.instrument] ?? 0) + Number(t.units);
      amountBySymbol[t.instrument] = (amountBySymbol[t.instrument] ?? 0) + Number(t.amount);
    }
  }
  const averagePurchasePriceBySymbol = Object.fromEntries(
    Object.keys(unitsBySymbol).map((s) => [s, unitsBySymbol[s] > 0 ? amountBySymbol[s] / unitsBySymbol[s] : 0])
  );

  const lastReserveEntry = await prisma.reserveLedgerEntry.findFirst({
    where: { strategyId },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    totalInvested,
    unitsBySymbol,
    averagePurchasePriceBySymbol,
    reserve: {
      plannedReserve: lastReserveEntry ? Number(lastReserveEntry.balanceAfter) : 0,
      actualBrokerCash: null, // never fabricated — no broker write/read integration exists (PART 18/73)
      note: "No broker balance API is connected. This is the planned reserve only, not verified broker cash.",
    },
    transactions,
  });
});

/** Manual transaction recording — PART 21/37. Used when no broker API can
 * supply confirmed fills, i.e. always, for now. */
const manualTransactionSchema = z.object({
  type: z.enum(["NORMAL_INVESTMENT", "RESERVE_CONTRIBUTION", "DIP_DEPLOYMENT", "CAP_DEPLOYMENT", "MANUAL_ADJUSTMENT", "REFUND", "WITHDRAWAL"]),
  amount: z.number(),
  instrument: z.string().min(1),
  price: z.number().positive().optional(),
  date: z.string().datetime().optional(),
  notes: z.string().optional(),
});

portfolioRouter.post("/transaction", async (req: AuthedRequest, res) => {
  const strategyId = await getDefaultStrategyId(req.userId!);
  if (!strategyId) return res.status(404).json({ error: "No strategy found" });

  const parsed = manualTransactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { type, amount, instrument, price, date, notes } = parsed.data;

  const transaction = await prisma.transaction.create({
    data: {
      strategyId,
      type,
      amount,
      instrument,
      price,
      units: price ? amount / price : null,
      date: date ? new Date(date) : new Date(),
      notes,
      source: "MANUAL",
      status: "RECORDED",
    },
  });

  res.status(201).json(transaction);
});
