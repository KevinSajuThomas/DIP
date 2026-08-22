import {
  TwelveDataProvider,
  AlphaVantageProvider,
  FallbackMarketDataProvider,
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
 * - Otherwise -> whichever of MARKET_DATA_API_KEY (Twelve Data) and
 *   ALPHA_VANTAGE_API_KEY are configured, tried in that order via
 *   FallbackMarketDataProvider — set either or both. If a symbol isn't
 *   covered by the first provider's plan/quota, the second gets a try.
 *
 * Never silently falls back to fabricated data — throws with a clear
 * message if nothing is configured.
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (process.env.SIMULATION_MODE === "true") {
    return simulationProvider;
  }
  if (cachedProvider) return cachedProvider;

  const providers: MarketDataProvider[] = [];
  if (process.env.MARKET_DATA_API_KEY) {
    providers.push(new TwelveDataProvider(process.env.MARKET_DATA_API_KEY));
  }
  if (process.env.ALPHA_VANTAGE_API_KEY) {
    providers.push(new AlphaVantageProvider(process.env.ALPHA_VANTAGE_API_KEY));
  }

  if (providers.length === 0) {
    throw new Error(
      "No market-data provider configured. Set MARKET_DATA_API_KEY (Twelve Data, " +
        "https://twelvedata.com) and/or ALPHA_VANTAGE_API_KEY (https://alphavantage.co) " +
        "— or set SIMULATION_MODE=true."
    );
  }

  const provider = providers.length === 1 ? providers[0] : new FallbackMarketDataProvider(providers);
  cachedProvider = provider;
  return provider;
}
