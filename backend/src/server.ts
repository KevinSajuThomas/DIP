import "dotenv/config";
import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { authRouter } from "./api/auth.js";
import { instrumentsRouter } from "./api/instruments.js";
import { marketRouter } from "./api/market.js";
import { portfolioRouter } from "./api/portfolio.js";
import { backtestsRouter } from "./api/backtests.js";
import { notificationsRouter } from "./api/notifications.js";
import { strategyRouter } from "./api/strategy.js";
import { healthRouter } from "./api/health.js";
import { simulationRouter } from "./api/simulation.js";

const app = express();
app.use(express.json());
app.use(pinoHttp({ logger }));

app.use("/api/auth", authRouter);
app.use("/api/instruments", instrumentsRouter);
app.use("/api/market", marketRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/api/backtests", backtestsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/strategy", strategyRouter);
app.use("/api/simulation", simulationRouter);
app.use("/api/health", healthRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT ?? 4000);

const server = app.listen(port, () => {
  logger.info(`DipBuy API listening on port ${port}`);
});

function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("Forcing shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
