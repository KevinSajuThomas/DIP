const IST_TIMEZONE = "Asia/Kolkata";

/**
 * NSE holidays are date-specific and change every year. Ship an empty
 * default and let the user configure the current year's list — do not
 * hard-code guessed holiday dates that could silently go stale.
 * Format: "YYYY-MM-DD".
 */
export interface MarketCalendarConfig {
  holidays: Set<string>;
  regularOpen: { hour: number; minute: number }; // IST
  regularClose: { hour: number; minute: number }; // IST
}

export const defaultMarketCalendarConfig: MarketCalendarConfig = {
  holidays: new Set<string>(),
  regularOpen: { hour: 9, minute: 15 },
  regularClose: { hour: 15, minute: 30 },
};

function nowInIst(date: Date): { hour: number; minute: number; weekday: number; ymd: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? -1,
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export class MarketCalendar {
  constructor(private readonly config: MarketCalendarConfig = defaultMarketCalendarConfig) {}

  isTradingDay(date: Date = new Date()): boolean {
    const { weekday, ymd } = nowInIst(date);
    if (weekday === 0 || weekday === 6) return false; // weekend
    if (this.config.holidays.has(ymd)) return false;
    return true;
  }

  isMarketOpen(date: Date = new Date()): boolean {
    if (!this.isTradingDay(date)) return false;
    const { hour, minute } = nowInIst(date);
    const nowMinutes = hour * 60 + minute;
    const openMinutes = this.config.regularOpen.hour * 60 + this.config.regularOpen.minute;
    const closeMinutes = this.config.regularClose.hour * 60 + this.config.regularClose.minute;
    return nowMinutes >= openMinutes && nowMinutes <= closeMinutes;
  }
}
