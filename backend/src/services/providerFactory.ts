import {
  HttpMarketDataProvider,
  SimulatedMarketDataProvider,
  type MarketDataProvider,
} from "./marketData.js";

let cachedProvider: MarketDataProvider | undefined;
export const simulationProvider = new SimulatedMarketDataProvider();

/**
 * Returns the active MarketDataProvider. In SIMULATION_MODE=true, returns
 * the in-memory simulated provider so prices can be set via the
 * simulation API without touching any real market or credentials.
 * Otherwise requires MARKET_DATA_API_URL / MARKET_DATA_API_KEY to be
 * configured — it will not silently fall back to fabricated data.
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (process.env.SIMULATION_MODE === "true") {
    return simulationProvider;
  }
  if (cachedProvider) return cachedProvider;

  const baseUrl = process.env.MARKET_DATA_API_URL;
  const apiKey = process.env.MARKET_DATA_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "MARKET_DATA_API_URL and MARKET_DATA_API_KEY must be set (or SIMULATION_MODE=true)."
    );
  }
  cachedProvider = new HttpMarketDataProvider(baseUrl, apiKey);
  return cachedProvider;
}
