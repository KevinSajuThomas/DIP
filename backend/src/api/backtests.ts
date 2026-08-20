import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../lib/auth.js";
import { runBacktest, compareToBaseline, normalSipConfig, type PricePoint } from "../engine/backtest.js";
import { validateStrategyConfig } from "../engine/strategyEngine.js";
import { getMarketDataProvider } from "../services/providerFactory.js";
import { DEFAULT_STRATEGY_CONFIG } from "../lib/types.js";
import type { StrategyConfig } from "../lib/types.js";

export const backtestsRouter = Router();
backtestsRouter.use(requireAuth);

async function getDefaultStrategyId(userId: string): Promise<string | null> {
  const strategy = await prisma.strategy.findFirst({ where: { userId, isActive: true } });
  return strategy?.id ?? null;
}

backtestsRouter.get("/", async (req: AuthedRequest, res) => {
  const strategyId = await getDefaultStrategyId(req.userId!);
  if (!strategyId) return res.json([]);
  const runs = await prisma.backtestRun.findMany({
    where: { strategyId },
    include: { results: true },
    orderBy: { requestedAt: "desc" },
  });
  res.json(runs);
});

const strategyConfigSchema = z.object({
  monthlyBudget: z.number().positive(),
  normalInvestment: z.number().nonnegative(),
  reserveContribution: z.number().nonnegative(),
  maxReserve: z.number().positive(),
  capRelease: z.number().positive(),
  dipDeploymentMultiplier: z.number().positive(),
  thresholds: z.array(z.object({ percent: z.number().positive() })),
});

const runSchema = z.object({
  symbol: z.string().min(1),
  periodYears: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
  dipbuyConfig: strategyConfigSchema.optional(), // defaults to DEFAULT_STRATEGY_CONFIG
  priceHistory: z.array(z.object({ date: z.string(), price: z.number().positive() })).optional(),
});

/** PART 31-36: compares Strategy A (100% SIP) vs Strategy B (DipBuy),
 * using the exact same strategyEngine functions the live worker uses
 * (PART 32) — runBacktest() is the only place this logic exists. */
backtestsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { symbol, periodYears, priceHistory } = parsed.data;

  const dipbuyConfig: StrategyConfig = {
    ...DEFAULT_STRATEGY_CONFIG,
    ...(parsed.data.dipbuyConfig ?? {}),
    primaryInstrumentSymbol: symbol,
  };
  const configErrors = validateStrategyConfig(dipbuyConfig);
  if (configErrors.length > 0) return res.status(400).json({ error: configErrors });

  let prices: PricePoint[];
  if (priceHistory && priceHistory.length > 0) {
    prices = priceHistory;
  } else {
    try {
      const provider = getMarketDataProvider();
      const to = new Date();
      const from = new Date(to);
      from.setFullYear(from.getFullYear() - periodYears);
      const history = await provider.getHistoricalData(symbol, from.toISOString(), to.toISOString());
      if (history.length === 0) {
        return res.status(422).json({
          error: "No historical data available from the configured provider. Supply priceHistory explicitly instead.",
        });
      }
      prices = history.map((h) => ({ date: h.date, price: h.close }));
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : String(err),
        hint: "Configure MARKET_DATA_API_URL/KEY, or pass priceHistory directly.",
      });
    }
  }

  const baselineResult = runBacktest("100% Normal SIP", normalSipConfig(dipbuyConfig.monthlyBudget), prices);
  const dipbuyResult = runBacktest("DipBuy", dipbuyConfig, prices);
  const results = [baselineResult, dipbuyResult];
  const comparison = compareToBaseline(baselineResult, dipbuyResult);

  const strategyId = await getDefaultStrategyId(req.userId!);
  let run = null;
  if (strategyId) {
    run = await prisma.backtestRun.create({
      data: {
        strategyId,
        periodYears,
        results: {
          create: results.map((r) => ({
            strategyName: r.strategyName,
            totalAllocated: r.totalAllocated,
            totalActuallyInvested: r.totalActuallyInvested,
            finalPortfolioValue: r.finalPortfolioValue,
            absoluteProfit: r.absoluteProfit,
            cagrPercent: r.cagrPercent,
            xirrPercent: r.xirrPercent,
            maxDrawdownPercent: r.maxDrawdownPercent,
            averagePurchasePrice: r.averagePurchasePrice,
            unitsAccumulated: r.unitsAccumulated,
            reserveUtilizationPercent: r.reserveUtilizationPercent,
            averageReserveSize: r.averageReserveSize,
            maxReserveObserved: r.maxReserveObserved,
            dipDeploymentCount: r.dipDeploymentCount,
            capDeploymentCount: r.capDeploymentCount,
            monthsWithReserve: r.monthsWithReserve,
            cashDragAmount: r.cashDragAmount,
          })),
        },
      },
      include: { results: true },
    });
  }

  res.status(201).json({
    run,
    results,
    comparison,
    disclaimer:
      "Historical backtesting does not guarantee future returns. Market drawdowns can persist or become deeper. No investment outcome is guaranteed.",
  });
});
