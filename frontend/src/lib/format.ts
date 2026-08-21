const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrFormatterDecimals = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** Formats a rupee amount using Indian digit grouping: ₹10,000 / ₹1,25,000 */
export function formatINR(amount: number | null | undefined, decimals = false): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return decimals ? inrFormatterDecimals.format(amount) : inrFormatter.format(amount);
}

/** Formats a percentage with a fixed sign and 2 decimals: -8.24% / +4.20% */
export function formatPercent(value: number | null | undefined, withSign = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = withSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
