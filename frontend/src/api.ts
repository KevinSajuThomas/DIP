const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getInstruments: () => request<any[]>("/instruments"),
  createInstrument: (data: any) =>
    request<any>("/instruments", { method: "POST", body: JSON.stringify(data) }),
  setPrimaryInstrument: (id: string, strategyId: string) =>
    request<any>(`/instruments/${id}/set-primary`, { method: "POST", body: JSON.stringify({ strategyId }) }),
  getInstrumentStatus: (id: string) => request<any>(`/instruments/${id}/status`),
  setThresholds: (id: string, thresholds: any[]) =>
    request<any>(`/instruments/${id}/thresholds`, {
      method: "POST",
      body: JSON.stringify({ thresholds }),
    }),
  resetCycle: (id: string, referenceHigh: number) =>
    request<any>(`/instruments/${id}/reset-cycle`, {
      method: "POST",
      body: JSON.stringify({ referenceHigh }),
    }),
  getPortfolio: (type?: string) =>
    request<any>(`/portfolio${type && type !== "ALL" ? `?type=${type}` : ""}`),
  recordTransaction: (data: any) =>
    request<any>("/portfolio/transaction", { method: "POST", body: JSON.stringify(data) }),
  getBacktests: () => request<any[]>("/backtests"),
  runBacktest: (data: any) => request<any>("/backtests", { method: "POST", body: JSON.stringify(data) }),
  getNotifications: () => request<any[]>("/notifications"),
  sendTestNotification: () => request<any>("/notifications/test", { method: "POST" }),

  getStrategy: () => request<any>("/strategy"),
  updateStrategySettings: (data: any) =>
    request<any>("/strategy/settings", { method: "PUT", body: JSON.stringify(data) }),
  getInvestmentCycles: () => request<any[]>("/strategy/investment-cycles"),
  getReserveLedger: () => request<any>("/strategy/reserve-ledger"),
  getAuditLog: () => request<any[]>("/strategy/audit-log"),
  getThresholdEvents: () => request<any[]>("/strategy/threshold-events"),
  resolveThresholdEvent: (id: string, action: "CONFIRM" | "SKIP" | "DEFER") =>
    request<any>(`/strategy/threshold-events/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  setSimulatedPrice: (symbol: string, price: number) =>
    request<any>("/simulation/price", { method: "POST", body: JSON.stringify({ symbol, price }) }),
  getMarketStatus: () => request<any>("/market/status"),
  searchSymbols: (q: string) => request<any[]>(`/market/search?q=${encodeURIComponent(q)}`),
  getMarketHistory: (symbol: string, days = 180) => request<Array<{ date: string; close: number }>>(`/market/${symbol}/history?days=${days}`),
  getHealth: () => request<any>("/health"),
};
