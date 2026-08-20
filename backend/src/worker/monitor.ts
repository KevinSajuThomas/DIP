import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import type { Prisma } from "@prisma/client";
import { logger } from "../lib/logger.js";
import { withRetry, withTimeout } from "../lib/retry.js";
import { getMarketDataProvider } from "../services/providerFactory.js";
import { MarketCalendar } from "../services/marketCalendar.js";
import { WhatsAppService, formatDipAlert, formatCapAlert, loadWhatsAppConfigFromEnv } from "../services/whatsapp.js";
import { evaluateThresholds } from "../engine/threshold.js";
import { updateCurrentCycleHigh } from "../engine/referenceCycle.js";
import { calculateMonthlyCycle, calculateDipDeployment, monthsElapsed } from "../engine/strategyEngine.js";
import type { ThresholdPercentConfig, StrategyConfig } from "../lib/types.js";
import { randomUUID } from "node:crypto";

const POLL_INTERVAL_MS = Number(process.env.POLLING_INTERVAL_SECONDS ?? 60) * 1000;
const STALE_QUOTE_MAX_AGE_MS = 15 * 60 * 1000;

const calendar = new MarketCalendar();
const whatsapp = new WhatsAppService(loadWhatsAppConfigFromEnv());

/**
 * The worker is a thin orchestrator (PART 63/64): it never computes
 * financial amounts itself, it only calls strategyEngine.ts and persists
 * the results. All 13 steps from PART 63 map directly onto the functions
 * below.
 */
export async function runMonitoringPass(): Promise<void> {
  if (!calendar.isTradingDay()) {
    logger.debug("Not a trading day — skipping pass");
    return;
  }
  if (!calendar.isMarketOpen()) {
    logger.debug("Outside market hours — skipping pass");
    return;
  }

  const strategies = await prisma.strategy.findMany({
    where: { isActive: true },
    include: {
      settings: true,
      primaryInstrument: {
        include: {
          thresholds: { where: { alertsEnabled: true } },
          referenceCycles: { where: { isActive: true }, take: 1 },
        },
      },
    },
  });

  const provider = getMarketDataProvider();

  for (const strategy of strategies) {
    try {
      await runMonthlyCycleIfDue(strategy);
      await processMarketDip(strategy, provider);
    } catch (err) {
      logger.error({ err, strategyId: strategy.id }, "Failed to process strategy");
    }
  }
}

function toStrategyConfig(settings: any): StrategyConfig {
  return {
    monthlyBudget: Number(settings.monthlyBudget),
    normalInvestment: Number(settings.normalInvestment),
    reserveContribution: Number(settings.reserveContribution),
    maxReserve: Number(settings.maxReserve),
    capRelease: Number(settings.capRelease),
    dipDeploymentMultiplier: Number(settings.dipDeploymentMultiplier),
    thresholds: [], // populated by caller when needed for evaluateThresholds
    primaryInstrumentSymbol: "",
    referenceMode: settings.referenceMode,
    skipKeepsTimerRunning: settings.skipKeepsTimerRunning,
  };
}

/**
 * Runs the ordinary monthly cycle exactly once per calendar month per
 * strategy — idempotent via the (strategyId, cycleMonth) unique
 * constraint on InvestmentCycle (PART 62).
 */
async function runMonthlyCycleIfDue(strategy: any) {
  if (!strategy.settings) return;
  const cycleMonth = new Date().toISOString().slice(0, 7);

  const existing = await prisma.investmentCycle.findUnique({
    where: { strategyId_cycleMonth: { strategyId: strategy.id, cycleMonth } },
  });
  if (existing) return; // already processed this month — idempotent no-op

  const lastEntry = await prisma.reserveLedgerEntry.findFirst({
    where: { strategyId: strategy.id },
    orderBy: { createdAt: "desc" },
  });
  const startingReserve = lastEntry ? Number(lastEntry.balanceAfter) : 0;

  const config = toStrategyConfig(strategy.settings);
  const cycle = calculateMonthlyCycle(config, startingReserve);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.investmentCycle.create({
      data: {
        strategyId: strategy.id,
        cycleMonth,
        monthlyBudget: cycle.monthlyBudget,
        normalInvestment: cycle.normalInvestment,
        plannedReserveContribution: cycle.plannedReserveContribution,
        actualReserveContribution: cycle.actualReserveContribution,
        capDeployment: cycle.capDeployment,
        contributionDivertedToCapRelease: cycle.contributionDivertedToCapRelease,
        totalActualInvestment: cycle.totalActualInvestment,
        startingReserve: cycle.startingReserve,
        endingReserve: cycle.endingReserve,
      },
    });

    if (cycle.actualReserveContribution > 0) {
      await tx.reserveLedgerEntry.create({
        data: {
          strategyId: strategy.id,
          entryType: "CONTRIBUTION",
          amount: cycle.actualReserveContribution,
          balanceAfter: cycle.startingReserve + cycle.actualReserveContribution,
          investmentCycleId: created.id,
        },
      });
    }

    await tx.transaction.create({
      data: {
        strategyId: strategy.id,
        investmentCycleId: created.id,
        type: "NORMAL_INVESTMENT",
        amount: cycle.normalInvestment,
        instrument: strategy.primaryInstrument?.symbol ?? "NIFTY50",
        date: new Date(),
        status: "PENDING_CONFIRMATION",
      },
    });

    if (cycle.capDeployment > 0 || cycle.contributionDivertedToCapRelease > 0) {
      const capTotal = cycle.capDeployment + cycle.contributionDivertedToCapRelease;
      await tx.reserveLedgerEntry.create({
        data: {
          strategyId: strategy.id,
          entryType: "CAP_DEPLOYMENT",
          amount: -capTotal,
          balanceAfter: cycle.endingReserve,
          investmentCycleId: created.id,
          note: `Cap release Rs ${cycle.capDeployment}, overflow diversion Rs ${cycle.contributionDivertedToCapRelease}`,
        },
      });
      await tx.transaction.create({
        data: {
          strategyId: strategy.id,
          investmentCycleId: created.id,
          type: "CAP_DEPLOYMENT",
          amount: capTotal,
          instrument: strategy.primaryInstrument?.symbol ?? "NIFTY50",
          date: new Date(),
          status: "PENDING_CONFIRMATION",
        },
      });

      if (strategy.settings.whatsappEnabled) {
        const message = formatCapAlert({
          reserveReached: cycle.startingReserve + cycle.plannedReserveContribution,
          maxReserve: config.maxReserve,
          capRelease: capTotal,
          remainingReserve: cycle.endingReserve,
          normalInvestment: cycle.normalInvestment,
          requiresConfirmation: true,
        });
        const sendResult = await whatsapp.sendAlert(message);
        await tx.notification.create({
          data: {
            strategyId: strategy.id,
            channel: "WHATSAPP",
            status: sendResult.ok ? "SENT" : "FAILED",
            messageBody: message,
            errorMessage: sendResult.errorMessage,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        strategyId: strategy.id,
        eventType: "MONTHLY_CYCLE",
        summary: `Monthly cycle ${cycleMonth}: budget Rs ${cycle.monthlyBudget}, normal Rs ${cycle.normalInvestment}, reserve contribution Rs ${cycle.actualReserveContribution}, cap deployment Rs ${cycle.capDeployment}, ending reserve Rs ${cycle.endingReserve}`,
        detailsJson: JSON.stringify(cycle),
      },
    });
  });
}

async function processMarketDip(strategy: any, provider: ReturnType<typeof getMarketDataProvider>) {
  const instrument = strategy.primaryInstrument;
  if (!instrument) return;
  const cycle = instrument.referenceCycles[0];
  if (!cycle) return;

  const quote = await withRetry(
    () => withTimeout(provider.getQuote(instrument.symbol), 10_000, `getQuote(${instrument.symbol})`),
    { retries: 3, baseDelayMs: 1000, onRetry: (a, e) => logger.warn({ attempt: a, err: e }, "Retrying quote fetch") }
  );

  const isStale = Date.now() - new Date(quote.fetchedAt).getTime() > STALE_QUOTE_MAX_AGE_MS;
  await prisma.marketSnapshot.create({
    data: {
      instrumentId: instrument.id,
      price: quote.price,
      fetchedAt: new Date(quote.fetchedAt),
      isStale,
      providerName: quote.providerName,
    },
  });
  if (isStale) {
    logger.warn({ symbol: instrument.symbol }, "Stale quote — no new event generated (PART 50)");
    return;
  }

  let effectiveCycle = cycle;
  const updated = updateCurrentCycleHigh(
    {
      referenceHigh: Number(cycle.referenceHigh),
      referenceHighDate: cycle.referenceHighDate.toISOString(),
      mode: "CURRENT_CYCLE_HIGH",
      triggeredThresholds: [],
    },
    quote.price,
    quote.fetchedAt
  );
  if (updated.referenceHigh !== Number(cycle.referenceHigh)) {
    await prisma.referenceCycle.update({ where: { id: cycle.id }, data: { isActive: false, closedAt: new Date() } });
    effectiveCycle = await prisma.referenceCycle.create({
      data: {
        instrumentId: instrument.id,
        referenceHigh: updated.referenceHigh,
        referenceHighDate: new Date(quote.fetchedAt),
        mode: "CURRENT_CYCLE_HIGH",
      },
    });
    // Past cycle events remain permanently recorded (PART 60) — nothing
    // deleted, the old ReferenceCycle row stays as history.
  }

  const priorEvents = await prisma.thresholdEvent.findMany({ where: { referenceCycleId: effectiveCycle.id } });
  const thresholds: ThresholdPercentConfig[] = instrument.thresholds.map(
    (t: { percent: unknown }) => ({ percent: Number(t.percent) })
  );

  const evaluation = evaluateThresholds(
    instrument.symbol,
    quote.price,
    {
      referenceHigh: Number(effectiveCycle.referenceHigh),
      referenceHighDate: effectiveCycle.referenceHighDate.toISOString(),
      mode: "CURRENT_CYCLE_HIGH",
      triggeredThresholds: priorEvents.map((e: { thresholdPercent: unknown }) => Number(e.thresholdPercent)),
    },
    thresholds
  );

  if (evaluation.newlyTriggered.length === 0) return;

  // PART 21/58: one strategy action per observation, keyed on the deepest
  // newly-crossed threshold. All crossed thresholds are still recorded for
  // history, but only the deepest gets isDeepestInBatch=true and produces
  // a dip-deployment calculation / alert.
  const batchId = randomUUID();
  const deepestPercent = evaluation.deepestNewlyTriggeredPercent;

  const lastDeployment = await prisma.reserveLedgerEntry.findFirst({
    where: { strategyId: strategy.id, entryType: "DIP_DEPLOYMENT" },
    orderBy: { createdAt: "desc" },
  });
  const lastReserveEntry = await prisma.reserveLedgerEntry.findFirst({
    where: { strategyId: strategy.id },
    orderBy: { createdAt: "desc" },
  });
  const availableReserve = lastReserveEntry ? Number(lastReserveEntry.balanceAfter) : 0;

  const anchorDate = lastDeployment ? lastDeployment.createdAt.toISOString() : strategy.createdAt.toISOString();
  const monthsSince = monthsElapsed(anchorDate, quote.fetchedAt);
  const config = toStrategyConfig(strategy.settings);
  const deployment = calculateDipDeployment(config, monthsSince, availableReserve);

  for (const t of evaluation.newlyTriggered) {
    const isDeepest = t.percent === deepestPercent;
    let event;
    try {
      event = await prisma.thresholdEvent.create({
        data: {
          strategyId: strategy.id,
          instrumentId: instrument.id,
          referenceCycleId: effectiveCycle.id,
          thresholdPercent: t.percent,
          batchId,
          isDeepestInBatch: isDeepest,
          triggerPrice: quote.price,
          actualPrice: quote.price,
          drawdownPercent: evaluation.drawdownPercent,
          classification: evaluation.classification.label,
          status: isDeepest ? "ACTION_PENDING" : "CROSSED",
          monthsSinceLastDeployment: isDeepest ? monthsSince : null,
          calculatedDeployment: isDeepest ? deployment.calculatedDeployment : null,
          reserveBefore: isDeepest ? availableReserve : null,
        },
      });
    } catch {
      logger.info({ symbol: instrument.symbol, threshold: t.percent }, "Duplicate threshold event skipped (unique constraint)");
      continue;
    }

    if (isDeepest && strategy.settings.whatsappEnabled) {
      const message = formatDipAlert({
        displayName: instrument.displayName,
        currentPrice: quote.price,
        referenceHigh: Number(effectiveCycle.referenceHigh),
        drawdownPercent: evaluation.drawdownPercent,
        thresholdPercent: t.percent,
        reserveAvailable: availableReserve,
        monthsSinceLastDeployment: monthsSince,
        calculatedDeployment: deployment.actualDeployment,
        normalInvestment: config.normalInvestment,
        requiresConfirmation: true,
      });
      const sendResult = await whatsapp.sendAlert(message);
      await prisma.notification.create({
        data: {
          strategyId: strategy.id,
          thresholdEventId: event.id,
          channel: "WHATSAPP",
          status: sendResult.ok ? "SENT" : "FAILED",
          messageBody: message,
          errorMessage: sendResult.errorMessage,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        strategyId: strategy.id,
        eventType: "DIP_DEPLOYMENT",
        summary: isDeepest
          ? `${instrument.symbol} -${t.percent}% (deepest in batch): calculated Rs ${deployment.calculatedDeployment}, awaiting confirmation`
          : `${instrument.symbol} -${t.percent}% crossed (part of batch, not the deployment trigger)`,
        detailsJson: JSON.stringify({ evaluation, deployment: isDeepest ? deployment : undefined }),
      },
    });
  }

  // The dip deployment itself is NOT applied to the reserve here — per
  // PART 19/27, money only moves after explicit user confirmation via the
  // API (/api/threshold-events/:id/confirm). This worker only creates the
  // ACTION_PENDING event and sends the alert.
}

function startWorker() {
  logger.info(`Starting DipBuy monitoring worker, polling every ${POLL_INTERVAL_MS / 1000}s`);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runMonitoringPass();
    } catch (err) {
      logger.error({ err }, "Monitoring pass failed");
    } finally {
      running = false;
    }
  };
  const interval = setInterval(tick, POLL_INTERVAL_MS);
  tick();

  const shutdown = () => {
    logger.info("Shutting down monitoring worker...");
    clearInterval(interval);
    prisma.$disconnect().finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1]?.endsWith("monitor.ts") || process.argv[1]?.endsWith("monitor.js")) {
  startWorker();
}
