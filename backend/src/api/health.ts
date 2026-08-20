import { Router } from "express";
import { checkDatabaseConnection } from "../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const dbOk = await checkDatabaseConnection();
  const status = dbOk ? 200 : 503;
  res.status(status).json({
    status: dbOk ? "ok" : "degraded",
    database: dbOk ? "connected" : "unreachable",
    simulationMode: process.env.SIMULATION_MODE === "true",
    timestamp: new Date().toISOString(),
  });
});
