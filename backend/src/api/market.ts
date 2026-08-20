import { Router } from "express";
import { getMarketDataProvider } from "../services/providerFactory.js";
import { requireAuth } from "../lib/auth.js";

export const marketRouter = Router();
marketRouter.use(requireAuth);

marketRouter.get("/status", async (_req, res) => {
  try {
    const provider = getMarketDataProvider();
    const status = await provider.getMarketStatus();
    res.json({ ...status, providerName: provider.name, isDelayed: provider.isDelayed });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

marketRouter.get("/:symbol", async (req, res) => {
  try {
    const provider = getMarketDataProvider();
    const quote = await provider.getQuote(req.params.symbol);
    res.json(quote);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
