import "dotenv/config";
import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { instrumentsRouter } from "./api/instruments.js";
import { marketRouter } from "./api/market.js";
import { portfolioRouter } from "./api/portfolio.js";
import { backtestsRouter } from "./api/backtests.js";
import { notificationsRouter } from "./api/notifications.js";
import { strategyRouter } from "./api/strategy.js";
import { healthRouter } from "./api/health.js";
import { simulationRouter } from "./api/simulation.js";

const app = express();

// The frontend and backend are deployed on different origins (e.g. two
// separate Render services), so the browser requires CORS headers before
// it will let the frontend fetch this API. ALLOWED_ORIGIN restricts this
// to your own frontend rather than allowing any site to call the API.
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "*";
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use(pinoHttp({ logger }));

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
