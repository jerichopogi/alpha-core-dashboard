import type { Deal } from "./types";

export const MANUAL = "manual";

/** `MANUAL`, or the magic number (as text) of the setup that opened the trade. */
export type Source = string;

export interface Trade {
  id: number;
  source: Source;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  openTime: number;
  closeTime: number;
  entry: number;
  exit: number;
  sl: number;
  tp: number;
  /** Net of swap, commission and fees. */
  profit: number;
  /** Profit in units of the money risked at entry; null when the trade had no stop. */
  r: number | null;
  exitReason: "target" | "stop" | "other";
}

export interface TradeStats {
  count: number;
  wins: number;
  winRate: number | null;
  net: number;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null;
  rCount: number;
  avgR: number | null;
  totalR: number;
  maxDrawdownR: number;
  longestLosingStreak: number;
  tradesPerMonth: number | null;
}

const VOLUME_EPSILON = 1e-8;
const SECONDS_PER_MONTH = (365.25 / 12) * 86400;
const MIN_DAYS_FOR_RATE = 7;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const netOf = (deal: Deal) => deal.profit + deal.swap + deal.commission + deal.fee;

function exitReasonOf(comment: string): Trade["exitReason"] {
  if (comment.startsWith("[tp")) return "target";
  if (comment.startsWith("[sl")) return "stop";
  return "other";
}

/** Groups deals into closed round-trip trades. Positions that are still open are left out. */
export function buildTrades(deals: Deal[], setupMagics: number[]): Trade[] {
  const byPosition = new Map<number, Deal[]>();
  for (const deal of deals) {
    if (deal.type !== "buy" && deal.type !== "sell") continue;
    if (!deal.position_id) continue;
    byPosition.set(deal.position_id, [...(byPosition.get(deal.position_id) ?? []), deal]);
  }

  const trades: Trade[] = [];
  for (const [id, group] of byPosition) {
    const sorted = [...group].sort((a, b) => a.time - b.time || a.ticket - b.ticket);
    const opens = sorted.filter((d) => d.entry === "in");
    const closes = sorted.filter((d) => d.entry === "out" || d.entry === "inout");
    if (opens.length === 0 || closes.length === 0) continue;

    const openVolume = sum(opens.map((d) => d.volume));
    const closeVolume = sum(closes.map((d) => d.volume));
    if (closeVolume + VOLUME_EPSILON < openVolume) continue;

    const first = opens[0];
    const last = closes[closes.length - 1];
    const profit = sum(sorted.map(netOf));
    const risk = sum(opens.map((d) => d.risk));
    trades.push({
      id,
      source: setupMagics.includes(first.magic) ? String(first.magic) : MANUAL,
      symbol: first.symbol,
      side: first.type === "buy" ? "buy" : "sell",
      volume: openVolume,
      openTime: first.time,
      closeTime: last.time,
      entry: sum(opens.map((d) => d.price * d.volume)) / openVolume,
      exit: sum(closes.map((d) => d.price * d.volume)) / closeVolume,
      sl: first.sl,
      tp: first.tp,
      profit,
      r: risk > 0 ? profit / risk : null,
      exitReason: exitReasonOf(last.comment),
    });
  }
  return trades.sort((a, b) => a.closeTime - b.closeTime || a.id - b.id);
}

export function computeStats(trades: Trade[], nowSeconds: number, sinceSeconds: number | null): TradeStats {
  const winners = trades.filter((t) => t.profit > 0);
  const losers = trades.filter((t) => t.profit < 0);
  const grossWin = sum(winners.map((t) => t.profit));
  const grossLoss = -sum(losers.map((t) => t.profit));
  const rs = trades.flatMap((t) => (t.r === null ? [] : [t.r]));

  let peak = 0;
  let cumulative = 0;
  let maxDrawdownR = 0;
  for (const r of rs) {
    cumulative += r;
    peak = Math.max(peak, cumulative);
    maxDrawdownR = Math.max(maxDrawdownR, peak - cumulative);
  }

  let streak = 0;
  let longestLosingStreak = 0;
  for (const trade of trades) {
    streak = trade.profit < 0 ? streak + 1 : 0;
    longestLosingStreak = Math.max(longestLosingStreak, streak);
  }

  const elapsed = sinceSeconds === null ? 0 : nowSeconds - sinceSeconds;
  return {
    count: trades.length,
    wins: winners.length,
    winRate: trades.length ? winners.length / trades.length : null,
    net: sum(trades.map((t) => t.profit)),
    avgWin: winners.length ? grossWin / winners.length : null,
    avgLoss: losers.length ? -grossLoss / losers.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    rCount: rs.length,
    avgR: rs.length ? sum(rs) / rs.length : null,
    totalR: sum(rs),
    maxDrawdownR,
    longestLosingStreak,
    tradesPerMonth: elapsed >= MIN_DAYS_FOR_RATE * 86400 ? trades.length / (elapsed / SECONDS_PER_MONTH) : null,
  };
}

export type CashKind = "deposit" | "withdrawal" | "adjustment";

export interface CashMove {
  ticket: number;
  time: number;
  kind: CashKind;
  amount: number;
  note: string;
}

export interface CashFlow {
  deposited: number;
  withdrawn: number;
  /** Broker credits and debits that are neither a deposit nor a withdrawal. */
  adjustments: number;
  /** Money still in from your own pocket: deposited minus withdrawn, plus adjustments. */
  net: number;
  moves: CashMove[];
}

function cashKindOf(deal: Deal): CashKind {
  if (/withdraw/i.test(deal.comment)) return "withdrawal";
  if (/deposit/i.test(deal.comment)) return "deposit";
  // Brokers label these inconsistently; an unlabelled debit is money leaving, an unlabelled credit is not your deposit.
  return deal.profit < 0 ? "withdrawal" : "adjustment";
}

/** Every balance operation on the account, classified and totalled. */
export function cashFlow(deals: Deal[]): CashFlow {
  const moves: CashMove[] = deals
    .filter((d) => d.type === "balance")
    .map((d) => ({ ticket: d.ticket, time: d.time, kind: cashKindOf(d), amount: d.profit, note: d.comment }))
    .sort((a, b) => a.time - b.time || a.ticket - b.ticket);
  const total = (kind: CashKind) => sum(moves.filter((m) => m.kind === kind).map((m) => m.amount));
  const deposited = total("deposit");
  const withdrawn = 0 - total("withdrawal");
  const adjustments = total("adjustment");
  return { deposited, withdrawn, adjustments, net: deposited - withdrawn + adjustments, moves };
}

export function firstActivity(deals: Deal[]): number | null {
  return deals.length ? Math.min(...deals.map((d) => d.time)) : null;
}
