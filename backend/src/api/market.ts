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

marketRouter.get("/search", async (req, res) => {
  const query = String(req.query.q ?? "").trim();
  if (!query) return res.status(400).json({ error: "Query parameter 'q' is required" });
  try {
    const provider = getMarketDataProvider();
    if (!provider.searchSymbols) {
      return res.status(501).json({ error: `${provider.name} does not support symbol search` });
    }
    const results = await provider.searchSymbols(query);
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

marketRouter.get("/:symbol/history", async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days ?? 180), 3650);
    const provider = getMarketDataProvider();
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days);
    const history = await provider.getHistoricalData(req.params.symbol, from.toISOString(), to.toISOString());
    res.json(history);
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
