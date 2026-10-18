import {
  balanceHistory,
  byHour,
  bySide,
  byWeekday,
  drawdownOf,
  monthlyResults,
  openRisks,
  rHistogram,
  streaks,
  type BalancePoint,
  type Bucket,
  type MonthResult,
} from "./analytics";
import { dayKey } from "./calendar";
import { formatDateTime, formatDuration, formatMoney, formatNumber, formatPercent, formatPrice, formatR, formatSignedMoney } from "./format";
import type { Group } from "./groups";
import { computeStats, type Trade } from "./trades";
import type { Deal, EquityPoint, Snapshot } from "./types";

/** Enough points for a sharp line on a wide screen without a heavy page. */
const MAX_CHART_POINTS = 1200;

export type Tone = "win" | "loss" | "flat" | "warn" | "neutral";

export interface Kpi {
  label: string;
  value: string;
  detail: string;
  /** Colours the value; only for results, never for levels like the balance. */
  tone: Tone;
  detailTone?: Tone;
}

export interface SeriesPoint {
  t: number;
  v: number;
}

export interface EquityChartData {
  balance: SeriesPoint[];
  equity: SeriesPoint[];
  /** Drawdown as a share of the balance at the peak, 0 to 1. */
  drawdown: SeriesPoint[];
  firstTime: number;
  now: number;
}

export interface RiskRow {
  ticket: number;
  group: Group;
  side: "buy" | "sell";
  volume: string;
  entry: string;
  stop: string;
  target: string;
  now: string;
  profit: string;
  outcome: Tone;
  risk: string;
  rNow: string;
  opened: string;
  /** Price between stop (0) and target (1); null without both. */
  progress: number | null;
  /** The entry on that same scale. */
  entryAt: number | null;
}

export interface StatItem {
  label: string;
  value: string;
  tone?: Tone;
}

export interface PerformanceView {
  key: string;
  label: string;
  count: number;
  stats: StatItem[];
  hours: Bucket[];
  weekdays: Bucket[];
  sides: Bucket[];
  rBins: Bucket[];
  months: MonthResult[];
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const toneOf = (value: number): Tone => (value > 0 ? "win" : value < 0 ? "loss" : "flat");
const average = (values: number[]) => (values.length ? sum(values) / values.length : null);

/** Keeps the lowest and highest point of each slice plus the last, so peaks, troughs and the current value survive. */
export function thin(points: SeriesPoint[], max = MAX_CHART_POINTS): SeriesPoint[] {
  if (points.length <= max) return points;
  const size = Math.ceil(points.length / Math.floor(max / 2));
  const kept: SeriesPoint[] = [];
  for (let i = 0; i < points.length; i += size) {
    const slice = points.slice(i, i + size);
    const low = slice.reduce((a, b) => (b.v < a.v ? b : a));
    const high = slice.reduce((a, b) => (b.v > a.v ? b : a));
    kept.push(...(low === high ? [low] : low.t <= high.t ? [low, high] : [high, low]));
  }
  const last = points[points.length - 1];
  return kept[kept.length - 1] === last ? kept : [...kept, last];
}

/**
 * The balance curve from deals plus the recorded equity, all as trading results, so the
 * drawdown counts open losses too. Deposits and withdrawals never show as gains or losses.
 */
function accountCurve(deals: Deal[], equity: EquityPoint[], snapshot: Snapshot) {
  const balance = balanceHistory(deals, snapshot.account.balance);
  const live = [...equity, { time: snapshot.receivedAt, balance: snapshot.account.balance, equity: snapshot.account.equity }];
  // Both lists are in time order: walk them together to find the money paid in at each equity point.
  let i = 0;
  const fromEquity: BalancePoint[] = live.map((p) => {
    while (i + 1 < balance.length && balance[i + 1].time <= p.time) i += 1;
    const paidIn = balance[i].balance - balance[i].result;
    return { time: p.time, balance: p.equity, result: p.equity - paidIn };
  });
  // Balance points carry no open profit; once equity is recorded, use only equity so the two never interleave.
  const merged = [...balance.filter((p) => p.time < live[0].time), ...fromEquity];
  return { balance, live, drawdown: drawdownOf(merged) };
}

export function buildInsights(args: {
  snapshot: Snapshot | null;
  deals: Deal[];
  equity: EquityPoint[];
  trades: Trade[];
  groups: Group[];
  groupOf: (key: string) => Group;
  tradingResult: number;
  netDeposited: number;
  nowSeconds: number;
}) {
  const { snapshot, deals, equity, trades, groups, groupOf, tradingResult, netDeposited, nowSeconds } = args;
  if (!snapshot) return null;

  const curve = accountCurve(deals, equity, snapshot);
  const risks = openRisks(snapshot.positions, deals);
  const openRisk = sum(risks.map((r) => Math.max(0, r.riskMoney ?? 0)));
  const noStop = risks.filter((r) => r.noStop).length;
  const floating = sum(snapshot.positions.map((p) => p.profit + p.swap));
  const today = trades.filter((t) => dayKey(t.closeTime) === dayKey(nowSeconds));
  const todayNet = sum(today.map((t) => t.profit));
  const { equity: eq, balance } = snapshot.account;

  const kpis: Kpi[] = [
    { label: "Balance", value: formatMoney(balance), detail: `Net deposited ${formatMoney(netDeposited)}`, tone: "neutral" },
    { label: "Equity", value: formatMoney(eq), detail: `Open ${formatSignedMoney(floating)}`, tone: "neutral", detailTone: toneOf(floating) },
    {
      label: "Today",
      value: formatSignedMoney(todayNet),
      detail: `${today.length} closed · open ${formatSignedMoney(floating)}`,
      tone: toneOf(todayNet),
    },
    {
      label: "At risk now",
      value: formatMoney(openRisk),
      detail: noStop
        ? `${noStop} position${noStop > 1 ? "s" : ""} without a stop`
        : `${formatPercent(eq > 0 ? openRisk / eq : null)} of equity · ${risks.length} open`,
      tone: noStop ? "warn" : "neutral",
    },
    {
      label: "Drawdown",
      value: curve.drawdown.current > 0 ? `−${formatMoney(curve.drawdown.current)}` : formatMoney(0),
      detail: `${formatPercent(curve.drawdown.currentPct)} below peak · worst ${formatPercent(curve.drawdown.maxPct)}`,
      tone: curve.drawdown.current > 0 ? "loss" : "flat",
    },
    { label: "Trading result", value: formatSignedMoney(tradingResult), detail: "All time, deposits excluded", tone: toneOf(tradingResult) },
  ];

  const chart: EquityChartData = {
    balance: thin(curve.balance.map((p) => ({ t: p.time, v: p.balance }))),
    equity: thin(curve.live.map((p) => ({ t: p.time, v: p.equity }))),
    drawdown: thin(curve.drawdown.series.map((p) => ({ t: p.time, v: p.pct }))),
    firstTime: Math.min(deals.length ? curve.balance[0].time : nowSeconds, curve.live[0]?.time ?? nowSeconds),
    now: nowSeconds,
  };

  const riskRows: RiskRow[] = risks.map(({ position: p, noStop: missing, riskMoney, rNow, progress, entryAt }) => {
    return {
      ticket: p.ticket,
      group: groupOf(String(p.magic)),
      side: p.type,
      volume: p.volume.toFixed(2),
      entry: formatPrice(p.price_open),
      stop: formatPrice(p.sl),
      target: formatPrice(p.tp),
      now: formatPrice(p.price_current),
      profit: formatSignedMoney(p.profit + p.swap),
      outcome: toneOf(p.profit + p.swap),
      risk: missing ? "No stop" : riskMoney === null ? "Unknown" : formatMoney(riskMoney),
      rNow: formatR(rNow),
      opened: formatDateTime(p.time),
      progress,
      entryAt,
    };
  });

  const performance: PerformanceView[] = [
    performanceOf("all", "All", trades, nowSeconds),
    ...groups.map((g) => performanceOf(g.key, g.label, trades.filter((t) => t.source === g.key), nowSeconds)),
  ];

  return { kpis, chart, riskRows, openRisk: formatMoney(openRisk), performance };
}

function performanceOf(key: string, label: string, trades: Trade[], nowSeconds: number): PerformanceView {
  const stats = computeStats(trades, nowSeconds, trades[0]?.openTime ?? null);
  const s = streaks(trades);
  const held = (list: Trade[]) => average(list.map((t) => t.closeTime - t.openTime));
  const winners = trades.filter((t) => t.profit > 0);
  const losers = trades.filter((t) => t.profit < 0);
  const best = trades.reduce<Trade | null>((a, t) => (!a || t.profit > a.profit ? t : a), null);
  const worst = trades.reduce<Trade | null>((a, t) => (!a || t.profit < a.profit ? t : a), null);
  const hold = (seconds: number | null) => (seconds === null ? "–" : formatDuration(seconds));

  const items: StatItem[] = [
    { label: "Trades", value: String(stats.count) },
    { label: "Win rate", value: formatPercent(stats.winRate) },
    { label: "Net", value: formatSignedMoney(stats.net), tone: toneOf(stats.net) },
    { label: "Per trade", value: stats.count ? formatSignedMoney(stats.net / stats.count) : "–", tone: toneOf(stats.net) },
    { label: "Profit factor", value: formatNumber(stats.profitFactor) },
    { label: "Average R", value: formatR(stats.avgR), tone: toneOf(stats.avgR ?? 0) },
    { label: "Average win", value: stats.avgWin === null ? "–" : formatMoney(stats.avgWin) },
    { label: "Average loss", value: stats.avgLoss === null ? "–" : formatMoney(Math.abs(stats.avgLoss)) },
    { label: "Best trade", value: best ? formatSignedMoney(best.profit) : "–", tone: best ? toneOf(best.profit) : undefined },
    { label: "Worst trade", value: worst ? formatSignedMoney(worst.profit) : "–", tone: worst ? toneOf(worst.profit) : undefined },
    { label: "Held, winners", value: hold(held(winners)) },
    { label: "Held, losers", value: hold(held(losers)) },
    { label: "Longest win run", value: String(s.longestWin) },
    { label: "Longest loss run", value: String(s.longestLoss) },
    {
      label: "Current run",
      value: s.currentKind ? `${s.current} ${s.currentKind === "win" ? (s.current === 1 ? "win" : "wins") : s.current === 1 ? "loss" : "losses"}` : "–",
      tone: s.currentKind === "win" ? "win" : s.currentKind === "loss" ? "loss" : undefined,
    },
    { label: "Max drawdown", value: stats.rCount ? `${stats.maxDrawdownR.toFixed(1)}R` : "–" },
  ];

  return {
    key,
    label,
    count: trades.length,
    stats: items,
    hours: byHour(trades),
    weekdays: byWeekday(trades),
    sides: bySide(trades),
    rBins: rHistogram(trades),
    months: monthlyResults(trades),
  };
}

export type Insights = NonNullable<ReturnType<typeof buildInsights>>;
