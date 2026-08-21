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
export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  country?: string;
  type?: string;
}

export interface MarketDataProvider {
  readonly name: string;
  readonly isDelayed: boolean;
  getQuote(symbol: string): Promise<Quote>;
  getHistoricalData(symbol: string, fromIso: string, toIso: string): Promise<HistoricalPoint[]>;
  getMarketStatus(): Promise<MarketStatus>;
  /** Optional: lets the UI offer symbol autocomplete instead of forcing the
   * user to guess an obscure ticker string. Not every provider supports
   * this, so it's optional on the interface. */
  searchSymbols?(query: string): Promise<SymbolSearchResult[]>;
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
/**
 * Twelve Data (https://twelvedata.com) — a documented, non-scraping REST
 * API with a free tier (800 requests/day, 8/min, no card required as of
 * this writing) that explicitly lists Nifty 50 among its supported
 * indices. This targets Twelve Data's actual endpoint shapes:
 *
 *   GET /price?symbol=X&apikey=Y          -> { "price": "24287.65" }
 *   GET /time_series?symbol=X&interval=1day&outputsize=N&apikey=Y
 *                                          -> { "values": [{ "datetime", "close" }, ...] }
 *   GET /market_state                      -> [{ "code", "is_market_open", ... }, ...]
 *
 * Twelve Data's exact symbol string for Nifty 50 may not be literally
 * "NIFTY50" — verify it via Twelve Data's own symbol-search page/dashboard
 * before relying on it, and set the instrument's `symbol` field in DipBuy
 * to whatever Twelve Data actually returns. Free-tier data may be delayed
 * for some exchanges — isDelayed is left true by default; tighten it only
 * once you've confirmed your specific plan's latency for NSE data.
 */
export class TwelveDataProvider implements MarketDataProvider {
  readonly name = "TwelveData";
  readonly isDelayed = true;
  private readonly baseUrl = "https://api.twelvedata.com";

  constructor(private readonly apiKey: string) {}

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams({ ...params, apikey: this.apiKey }).toString();
    const res = await fetch(`${this.baseUrl}${path}?${query}`);
    const data = (await res.json()) as any;
    if (!res.ok || data.status === "error" || data.code >= 400) {
      throw new Error(
        `Twelve Data request failed: ${data.message ?? data.code ?? res.status}`
      );
    }
    return data as T;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const data = await this.request<{ price: string }>("/price", { symbol });
    const price = Number(data.price);
    if (!Number.isFinite(price)) {
      throw new Error(`Twelve Data returned a non-numeric price for ${symbol}: ${data.price}`);
    }
    return {
      symbol,
      price,
      fetchedAt: new Date().toISOString(),
      isDelayed: this.isDelayed,
      providerName: this.name,
    };
  }

  async getHistoricalData(
    symbol: string,
    fromIso: string,
    toIso: string
  ): Promise<HistoricalPoint[]> {
    const data = await this.request<{
      values?: Array<{ datetime: string; close: string }>;
    }>("/time_series", {
      symbol,
      interval: "1day",
      start_date: fromIso.slice(0, 10),
      end_date: toIso.slice(0, 10),
    });
    if (!data.values) return [];
    // Twelve Data returns newest-first; the engine expects ascending order.
    return data.values
      .map((v) => ({ date: v.datetime.slice(0, 10), close: Number(v.close) }))
      .reverse();
  }

  async getMarketStatus(): Promise<MarketStatus> {
    const data = await this.request<Array<{ code: string; is_market_open: boolean }>>(
      "/market_state",
      {}
    );
    // NSE's market_state code — confirm the exact code Twelve Data uses for
    // NSE in your account's response before relying on this in production;
    // this checks for any entry whose code mentions NSE as a reasonable
    // default rather than hard-coding an unverified exact string.
    const nse = data.find((m) => m.code?.toUpperCase().includes("NSE"));
    const isOpen = nse?.is_market_open ?? false;
    return {
      isOpen,
      session: isOpen ? "REGULAR" : "CLOSED",
      asOf: new Date().toISOString(),
    };
  }

  /**
   * Real, documented Twelve Data endpoint: GET /symbol_search?symbol=X
   * Returns matching instruments ordered by relevance. The exact response
   * envelope/field names were not fully confirmed from public docs at
   * implementation time, so this parses defensively across the couple of
   * shapes Twelve Data's endpoints commonly use (`data` array with either
   * `instrument_name` or `name`) rather than assuming one exact schema —
   * if your account returns something different, log the raw response
   * once and adjust the field names below.
   */
  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    const raw = await this.request<any>("/symbol_search", { symbol: query });
    const list: any[] = raw.data ?? raw.matches ?? raw.result ?? (Array.isArray(raw) ? raw : []);
    return list.map((d) => ({
      symbol: d.symbol,
      name: d.instrument_name ?? d.name ?? d.symbol,
      exchange: d.exchange ?? "",
      country: d.country,
      type: d.instrument_type ?? d.type,
    }));
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
