import type { Trade } from "./trades";

const TIME_ZONE = "Asia/Manila";
// en-CA formats as YYYY-MM-DD, which sorts and compares as plain text.
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export interface DayResult {
  /** Philippine calendar date the trades closed on, as YYYY-MM-DD. */
  date: string;
  total: number;
  ea: number;
  manual: number;
  trades: number;
  wins: number;
}

export const dayKey = (epochSeconds: number): string => dayKeyFormat.format(new Date(epochSeconds * 1000));

/** Closed-trade profit grouped by the Philippine day each trade closed, oldest first. */
export function dailyResults(trades: Trade[]): DayResult[] {
  const days = new Map<string, DayResult>();
  for (const trade of trades) {
    const date = dayKey(trade.closeTime);
    const day = days.get(date) ?? { date, total: 0, ea: 0, manual: 0, trades: 0, wins: 0 };
    days.set(date, {
      ...day,
      total: day.total + trade.profit,
      ea: day.ea + (trade.source === "ea" ? trade.profit : 0),
      manual: day.manual + (trade.source === "manual" ? trade.profit : 0),
      trades: day.trades + 1,
      wins: day.wins + (trade.profit > 0 ? 1 : 0),
    });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface MonthGrid {
  /** YYYY-MM */
  month: string;
  /** Rows of seven cells, Monday first; null pads the days outside the month. */
  weeks: Array<Array<string | null>>;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Lays a month out as Monday-first weeks. `month` is YYYY-MM. */
export function monthGrid(month: string): MonthGrid {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const cells: Array<string | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
  const trailing = (7 - (cells.length % 7)) % 7;
  const padded = [...cells, ...Array.from({ length: trailing }, () => null)];
  return { month, weeks: Array.from({ length: padded.length / 7 }, (_, w) => padded.slice(w * 7, w * 7 + 7)) };
}

/** Moves a YYYY-MM month forward or back. */
export function shiftMonth(month: string, by: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + by, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}
