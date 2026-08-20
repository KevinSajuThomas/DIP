export interface Quote {
  symbol: string;
  price: number;
  fetchedAt: string; // ISO
  isDelayed: boolean;
  providerName: string;
}

export interface HistoricalPoint {
  date: string; // ISO date
  close: number;
}

export interface MarketStatus {
  isOpen: boolean;
  session: "PRE_OPEN" | "REGULAR" | "CLOSED" | "HOLIDAY";
  asOf: string; // ISO, Asia/Kolkata wall-clock representation
}

/**
 * MarketDataProvider is intentionally an interface, not a class, so the
 * concrete provider (a paid API, a free API, a broker feed, etc.) can be
 * swapped without touching the engine or worker. Never scrape.
 */
export interface MarketDataProvider {
  readonly name: string;
  readonly isDelayed: boolean;
  getQuote(symbol: string): Promise<Quote>;
  getHistoricalData(symbol: string, fromIso: string, toIso: string): Promise<HistoricalPoint[]>;
  getMarketStatus(): Promise<MarketStatus>;
}

/**
 * Config-driven HTTP provider. Points at whatever legitimate market-data
 * API the user configures via MARKET_DATA_API_URL / MARKET_DATA_API_KEY.
 * The exact request/response shape below is a reasonable default (a
 * REST endpoint returning { price, asOf } for quotes and an array of
 * { date, close } for history) — adjust `mapQuote`/`mapHistory` to match
 * whichever provider is actually configured; nothing here is scraped and
 * nothing is invented to look like a working integration without a real
 * key configured.
 */
export class HttpMarketDataProvider implements MarketDataProvider {
  readonly name = "HttpMarketDataProvider";
  readonly isDelayed: boolean;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    isDelayed = true
  ) {
    this.isDelayed = isDelayed;
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`Market data request failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const data = await this.request<{ price: number; asOf: string }>(
      `/quote?symbol=${encodeURIComponent(symbol)}`
    );
    return {
      symbol,
      price: data.price,
      fetchedAt: data.asOf ?? new Date().toISOString(),
      isDelayed: this.isDelayed,
      providerName: this.name,
    };
  }

  async getHistoricalData(
    symbol: string,
    fromIso: string,
    toIso: string
  ): Promise<HistoricalPoint[]> {
    const data = await this.request<Array<{ date: string; close: number }>>(
      `/history?symbol=${encodeURIComponent(symbol)}&from=${fromIso}&to=${toIso}`
    );
    return data.map((d) => ({ date: d.date, close: d.close }));
  }

  async getMarketStatus(): Promise<MarketStatus> {
    const data = await this.request<{ isOpen: boolean; session: MarketStatus["session"] }>(
      `/market-status`
    );
    return { isOpen: data.isOpen, session: data.session, asOf: new Date().toISOString() };
  }
}

/**
 * In-memory provider for simulation mode and tests. Lets the user (or the
 * simulation UI) set an arbitrary "current price" per symbol without
 * touching any real market and without ever sending a real WhatsApp
 * message unless simulation alerts are explicitly enabled.
 */
export class SimulatedMarketDataProvider implements MarketDataProvider {
  readonly name = "SimulatedMarketDataProvider";
  readonly isDelayed = false;
  private prices = new Map<string, number>();

  setPrice(symbol: string, price: number) {
    this.prices.set(symbol, price);
  }

  async getQuote(symbol: string): Promise<Quote> {
    const price = this.prices.get(symbol);
    if (price === undefined) {
      throw new Error(`No simulated price set for ${symbol}`);
    }
    return {
      symbol,
      price,
      fetchedAt: new Date().toISOString(),
      isDelayed: false,
      providerName: this.name,
    };
  }

  async getHistoricalData(): Promise<HistoricalPoint[]> {
    return [];
  }

  async getMarketStatus(): Promise<MarketStatus> {
    return { isOpen: true, session: "REGULAR", asOf: new Date().toISOString() };
  }
}
