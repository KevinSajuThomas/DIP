/**
 * BrokerProvider is a READ-ONLY capability abstraction, per PART 25-27.
 *
 * As of this writing there is no publicly documented, officially supported
 * INDmoney API for third-party integration. This file therefore does NOT
 * implement any live INDmoney connection — doing so would mean either
 * fabricating endpoints or scraping/automating their app, both explicitly
 * forbidden. What exists here is:
 *
 *   1. The interface shape a real integration would need to satisfy.
 *   2. An `UnavailableBrokerProvider` that reports every capability as
 *      unsupported and fails loudly/honestly on every call — so the rest
 *      of the app (dashboard, confirmation flow) can render "Manual
 *      confirmation required" instead of silently pretending a broker
 *      connection exists.
 *
 * If Anthropic/you later obtain access to an official INDmoney API or
 * partner integration, implement a new class here that satisfies this
 * interface using ONLY documented endpoints, and flip
 * BrokerConnection.status to CONNECTED with the specific capabilities that
 * API actually supports — never assume order placement is supported just
 * because portfolio read is.
 */

export interface BrokerCapabilities {
  portfolioRead: boolean;
  balanceRead: boolean;
  orderPlacement: boolean;
  /** Always false for this app — DipBuy never trades automatically,
   * regardless of what a broker API might technically allow (PART 27). */
  automaticTrading: false;
}

export interface BrokerPortfolioPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentValue: number;
}

export interface BrokerBalance {
  availableCash: number;
  currency: string;
}

export interface BrokerTransaction {
  id: string;
  date: string;
  symbol: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
}

export interface BrokerOrder {
  id: string;
  symbol: string;
  status: string;
  placedAt: string;
}

export interface BrokerProvider {
  readonly name: string;
  readonly capabilities: BrokerCapabilities;
  isConnected(): Promise<boolean>;
  getPortfolio(): Promise<BrokerPortfolioPosition[]>;
  getBalances(): Promise<BrokerBalance[]>;
  getTransactions(fromIso: string, toIso: string): Promise<BrokerTransaction[]>;
  /** Only meaningful if capabilities.orderPlacement is true. Never called
   * automatically by DipBuy — only after explicit user confirmation in the
   * UI, per PART 27's mandatory confirm-then-submit workflow. */
  getOrders(): Promise<BrokerOrder[]>;
}

/**
 * The only BrokerProvider implementation shipped today. Every method
 * rejects clearly rather than fabricating data — the app must show
 * "Manual confirmation required" rather than claim a broker connection
 * that doesn't exist (PART 73).
 */
export class UnavailableBrokerProvider implements BrokerProvider {
  readonly name = "INDMONEY";
  readonly capabilities: BrokerCapabilities = {
    portfolioRead: false,
    balanceRead: false,
    orderPlacement: false,
    automaticTrading: false,
  };

  async isConnected(): Promise<boolean> {
    return false;
  }

  async getPortfolio(): Promise<BrokerPortfolioPosition[]> {
    throw new Error(
      "No officially supported INDmoney API is connected. Record this transaction manually instead."
    );
  }

  async getBalances(): Promise<BrokerBalance[]> {
    throw new Error(
      "No officially supported INDmoney API is connected. Record this transaction manually instead."
    );
  }

  async getTransactions(): Promise<BrokerTransaction[]> {
    throw new Error(
      "No officially supported INDmoney API is connected. Record this transaction manually instead."
    );
  }

  async getOrders(): Promise<BrokerOrder[]> {
    throw new Error(
      "No officially supported INDmoney API is connected. Order placement is unsupported."
    );
  }
}

export function getBrokerProvider(): BrokerProvider {
  // No real provider is wired up — see file header. Swap this factory for
  // a real implementation only once an official API is actually available
  // and has been tested against real credentials.
  return new UnavailableBrokerProvider();
}
