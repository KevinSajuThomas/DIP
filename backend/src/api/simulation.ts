import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";
import { simulationProvider } from "../services/providerFactory.js";

export const simulationRouter = Router();
simulationRouter.use(requireAuth);

const setPriceSchema = z.object({ symbol: z.string().min(1), price: z.number().positive() });

simulationRouter.post("/price", (req, res) => {
  if (process.env.SIMULATION_MODE !== "true") {
    return res.status(409).json({
      error: "SIMULATION_MODE is not enabled. Set SIMULATION_MODE=true to use simulated prices.",
    });
  }
  const parsed = setPriceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  simulationProvider.setPrice(parsed.data.symbol, parsed.data.price);
  res.json({ ok: true, symbol: parsed.data.symbol, price: parsed.data.price });
});
