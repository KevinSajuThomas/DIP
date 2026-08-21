import "dotenv/config";
import "./server.js"; // starts the Express API and begins listening
import { runMonitoringPass } from "./worker/monitor.js";
import { logger } from "./lib/logger.js";

/**
 * Render's free tier only supports Web Services and Static Sites —
 * Background Workers require a paid plan. To keep the whole stack on the
 * free tier, this entrypoint runs the monitoring loop inside the same
 * process as the API server instead of as a separate service.
 *
 * This is functionally identical to running `worker/monitor.ts` standalone
 * (same runMonitoringPass() call, same interval) — it is only the process
 * boundary that changes. For any deployment with room for a real
 * background worker (Docker Compose, a paid Render plan, etc.), prefer
 * running worker/monitor.ts as its own process instead, so a worker crash
 * can't take the API down with it.
 */
const POLL_INTERVAL_MS = Number(process.env.POLLING_INTERVAL_SECONDS ?? 60) * 1000;

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    await runMonitoringPass();
  } catch (err) {
    logger.error({ err }, "Monitoring pass failed (in-process worker)");
  } finally {
    running = false;
  }
}

logger.info(`In-process monitoring worker starting, polling every ${POLL_INTERVAL_MS / 1000}s`);
setInterval(tick, POLL_INTERVAL_MS);
tick();
