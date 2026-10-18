import type { Trade } from "./trades";
import type { Deal, Position } from "./types";

/** The Philippines has no daylight saving, so a fixed offset gives its local clock. */
const PH_OFFSET_SECONDS = 8 * 3600;
const R_BIN = 0.5;
const R_MIN = -1.5;
const R_MAX = 3;
/** A balance below this (a few cents left after a wipe-out) counts as an empty account. */
const EMPTY_BALANCE = 1;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const netOf = (deal: Deal) => deal.profit + deal.swap + deal.commission + deal.fee;
const phDate = (epochSeconds: number) => new Date((epochSeconds + PH_OFFSET_SECONDS) * 1000);
const minus = (value: number) => (value < 0 ? `−${Math.abs(value)}` : String(value));

export interface BalancePoint {
  time: number;
  balance: number;
  /** Balance minus the money you put in (net) up to that moment: what trading made. */
  result: number;
}

/**
 * Balance after every deal, worked back from today's balance so a gap in early history
 * cannot shift the curve. The first point is the balance before the oldest known deal.
 */
export function balanceHistory(deals: Deal[], currentBalance: number): BalancePoint[] {
  const sorted = [...deals].sort((a, b) => a.time - b.time || a.ticket - b.ticket);
  const start = currentBalance - sum(sorted.map(netOf));
  let balance = start;
  let cashIn = 0;
  const first: BalancePoint = { time: sorted[0]?.time ?? 0, balance: start, result: 0 };
  return [
    first,
    ...sorted.map((deal) => {
      balance += netOf(deal);
      if (deal.type === "balance") cashIn += deal.profit;
      return { time: deal.time, balance, result: balance - start - cashIn };
    }),
  ];
}

export interface Drawdown {
  /** Money below the best trading result since the account last held money (a wipe-out starts a new run). */
  current: number;
  /** Time-weighted: each result counts against the balance just before it, so cash moves never count. */
  currentPct: number;
  max: number;
  maxPct: number;
  /** Worst percentage since the account last held money (the current run). */
  runMaxPct: number;
  series: Array<{ time: number; drawdown: number; pct: number }>;
}

export function drawdownOf(points: BalancePoint[]): Drawdown {
  let peak = points[0]?.result ?? 0;
  let index = 1;
  let peakIndex = 1;
  let runMaxPct = 0;
  const series = points.map((p, i) => {
    const previous = points[i - 1];
    if (previous && previous.balance > EMPTY_BALANCE) {
      index *= Math.max(0, 1 + (p.result - previous.result) / previous.balance);
    } else if (previous) {
      // The account was empty (wiped out or fully withdrawn): money paid in after that starts a fresh run.
      index = 1;
      peakIndex = 1;
      peak = p.result;
      runMaxPct = 0;
    }
    peak = Math.max(peak, p.result);
    peakIndex = Math.max(peakIndex, index);
    const pct = peakIndex > 0 ? 1 - index / peakIndex : 0;
    runMaxPct = Math.max(runMaxPct, pct);
    return { time: p.time, drawdown: peak - p.result, pct };
  });
  const last = series[series.length - 1] ?? { drawdown: 0, pct: 0 };
  const max = Math.max(0, ...series.map((p) => p.drawdown));
  const maxPct = Math.max(0, ...series.map((p) => p.pct));
  return { current: last.drawdown, currentPct: last.pct, max, maxPct, runMaxPct, series };
}

export interface OpenRisk {
  position: Position;
  noStop: boolean;
  /** Money lost if the current stop is hit (0 once the stop is at or past entry); null if unknown. */
  riskMoney: number | null;
  /** Open profit in units of the risk taken at entry, for the lots still open. */
  rNow: number | null;
  /** Where price sits from stop (0) to target (1); null without both. */
  progress: number | null;
  /** The entry on that same scale. */
  entryAt: number | null;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Account money per 1.0 price move per lot: from the opening order's risk, else from the open profit. */
function valuePerPoint(position: Position, opening: Deal | undefined): number | null {
  const stopDistance = opening ? Math.abs(opening.price - opening.sl) : 0;
  if (opening && opening.risk > 0 && opening.sl && stopDistance > 0 && opening.volume > 0) return opening.risk / (stopDistance * opening.volume);
  const direction = position.type === "buy" ? 1 : -1;
  const moved = direction * (position.price_current - position.price_open);
  if (Math.abs(moved) < 1e-9 || position.volume <= 0) return null;
  return position.profit / moved / position.volume;
}

export function openRisks(positions: Position[], deals: Deal[]): OpenRisk[] {
  return positions.map((position) => {
    const opening = deals.find((d) => d.position_id === position.ticket && d.entry === "in");
    const direction = position.type === "buy" ? 1 : -1;
    const perPoint = valuePerPoint(position, opening);
    const noStop = !position.sl;
    const riskMoney = noStop || perPoint === null ? null : Math.max(0, direction * (position.price_open - position.sl)) * perPoint * position.volume;
    const initialRisk = opening && opening.risk > 0 && opening.volume > 0 ? (opening.risk * position.volume) / opening.volume : riskMoney;
    const span = position.tp - position.sl;
    const onBar = !noStop && position.tp && span !== 0;
    return {
      position,
      noStop,
      riskMoney,
      rNow: initialRisk ? (position.profit + position.swap) / initialRisk : null,
      progress: onBar ? clamp01((position.price_current - position.sl) / span) : null,
      entryAt: onBar ? clamp01((position.price_open - position.sl) / span) : null,
    };
  });
}

export interface Bucket {
  key: string;
  label: string;
  trades: number;
  wins: number;
  net: number;
  avgR: number | null;
}

function bucketOf(key: string, label: string, trades: Trade[]): Bucket {
  const rs = trades.flatMap((t) => (t.r === null ? [] : [t.r]));
  return {
    key,
    label,
    trades: trades.length,
    wins: trades.filter((t) => t.profit > 0).length,
    net: sum(trades.map((t) => t.profit)),
    avgR: rs.length ? sum(rs) / rs.length : null,
  };
}

/** By the Philippine hour the trade was opened. */
export function byHour(trades: Trade[]): Bucket[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const label = String(hour).padStart(2, "0");
    return bucketOf(label, label, trades.filter((t) => phDate(t.openTime).getUTCHours() === hour));
  });
}

/** By the Philippine weekday the trade was opened, Monday first. */
export function byWeekday(trades: Trade[]): Bucket[] {
  return WEEKDAYS.map((label, index) =>
    bucketOf(label, label, trades.filter((t) => (phDate(t.openTime).getUTCDay() + 6) % 7 === index)),
  );
}

export function bySide(trades: Trade[]): Bucket[] {
  return [bucketOf("buy", "Long", trades.filter((t) => t.side === "buy")), bucketOf("sell", "Short", trades.filter((t) => t.side === "sell"))];
}

/** Half-R bins, lower edge included, with open-ended bins below −1.5R and from 3R. */
export function rHistogram(trades: Trade[]): Bucket[] {
  const withR = trades.filter((t): t is Trade & { r: number } => t.r !== null);
  const edges = Array.from({ length: Math.round((R_MAX - R_MIN) / R_BIN) + 1 }, (_, i) => R_MIN + i * R_BIN);
  const bins = [
    bucketOf("low", `< ${minus(R_MIN)}`, withR.filter((t) => t.r < R_MIN)),
    ...edges.slice(0, -1).map((lo, i) => {
      const hi = edges[i + 1];
      return bucketOf(String(lo), `${minus(lo)} to ${minus(hi)}`, withR.filter((t) => t.r >= lo && t.r < hi));
    }),
    bucketOf("high", `≥ ${R_MAX}`, withR.filter((t) => t.r >= R_MAX)),
  ];
  return bins;
}

export interface MonthResult {
  /** YYYY-MM, Philippine time. */
  month: string;
  net: number;
  trades: number;
  wins: number;
}

export function monthlyResults(trades: Trade[]): MonthResult[] {
  const months = new Map<string, MonthResult>();
  for (const t of trades) {
    const month = phDate(t.closeTime).toISOString().slice(0, 7);
    const m = months.get(month) ?? { month, net: 0, trades: 0, wins: 0 };
    months.set(month, { month, net: m.net + t.profit, trades: m.trades + 1, wins: m.wins + (t.profit > 0 ? 1 : 0) });
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface Streaks {
  current: number;
  currentKind: "win" | "loss" | null;
  longestWin: number;
  longestLoss: number;
}

export function streaks(trades: Trade[]): Streaks {
  let run = 0;
  let kind: Streaks["currentKind"] = null;
  let longestWin = 0;
  let longestLoss = 0;
  for (const t of trades) {
    const k = t.profit > 0 ? "win" : t.profit < 0 ? "loss" : null;
    run = k !== null && k === kind ? run + 1 : k === null ? 0 : 1;
    kind = k;
    if (kind === "win") longestWin = Math.max(longestWin, run);
    if (kind === "loss") longestLoss = Math.max(longestLoss, run);
  }
  return { current: run, currentKind: kind, longestWin, longestLoss };
}
