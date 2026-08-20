import {
  TwelveDataProvider,
  SimulatedMarketDataProvider,
  type MarketDataProvider,
} from "./marketData.js";

let cachedProvider: MarketDataProvider | undefined;
export const simulationProvider = new SimulatedMarketDataProvider();

/**
 * Returns the active MarketDataProvider.
 *
 * - SIMULATION_MODE=true -> the in-memory simulated provider, no real
 *   market or credentials touched.
 * - Otherwise -> TwelveDataProvider, a real documented REST API with a
 *   free tier, requires MARKET_DATA_API_KEY.
 *
 * Never silently falls back to fabricated data — throws with a clear
 * message if nothing is configured.
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (process.env.SIMULATION_MODE === "true") {
    return simulationProvider;
  }
  if (cachedProvider) return cachedProvider;

  const apiKey = process.env.MARKET_DATA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MARKET_DATA_API_KEY must be set to use Twelve Data (or set SIMULATION_MODE=true). " +
        "Get a free key at https://twelvedata.com."
    );
  }
  const provider = new TwelveDataProvider(apiKey);
  cachedProvider = provider;
  return provider;
}
