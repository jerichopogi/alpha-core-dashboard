import type { EdgePoint } from "@/components/EdgeChart";
import type { PnlPoint } from "@/components/PnlChart";
import type { StatItem, TradeRow } from "@/components/TradesPanel";
import { backtestFor, expectedPath, MIN_TRADES_TO_JUDGE, verdict, type Backtest, type ExpectedPoint } from "./benchmark";
import { dailyResults, dayKey } from "./calendar";
import {
  formatAge,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPrice,
  formatR,
  formatSignedMoney,
} from "./format";
import { buildGroups, MANUAL_GROUP, type Group } from "./groups";
import { STALE_AFTER_SECONDS } from "./snapshot";
import { buildTrades, cashFlow, computeStats, firstActivity, MANUAL, type CashKind, type Trade, type TradeStats } from "./trades";
import type { DashboardData, EaState, Signal } from "./types";

const MIN_CHART_TRADES = 40;
const MAX_SIGNAL_ROWS = 150;
export const ALL = "all";

export type Outcome = "win" | "loss" | "flat";
export type EaStatus = "running" | "down";

export interface BenchmarkRow {
  metric: string;
  live: string;
  backtest: string;
}

export interface SetupView extends Group {
  market: string;
  status: { state: EaStatus; label: string; detail: string };
  risk: string;
  riskMoney: string;
  filterOn: boolean;
  ratio: number;
  ratioMin: number;
  lossesToday: number;
  net: string;
  netOutcome: Outcome;
  /** Null when no backtest exists for the setup's timeframe. */
  comparison: {
    verdict: string;
    description: string;
    rows: BenchmarkRow[];
    live: EdgePoint[];
    expected: ExpectedPoint[];
  } | null;
}

export interface SignalRow {
  key: string;
  time: string;
  setup: string;
  color: number;
  dir: Signal["dir"];
  close: string;
  ratio: string;
  action: Signal["action"];
  detail: string;
}

export interface CashRow {
  ticket: number;
  time: string;
  kind: CashKind;
  amount: string;
  note: string;
}

export interface PositionRow {
  ticket: number;
  group: Group;
  side: "buy" | "sell";
  volume: string;
  entry: string;
  sl: string;
  tp: string;
  current: string;
  profit: string;
  outcome: Outcome;
  opened: string;
}

const outcomeOf = (value: number): Outcome => (value > 0 ? "win" : value < 0 ? "loss" : "flat");

const EXIT_LABEL: Record<Trade["exitReason"], string> = { target: "Target", stop: "Stop", other: "Manual or EA close" };

function tradeRow(trade: Trade, group: Group): TradeRow {
  return {
    id: trade.id,
    source: trade.source,
    sourceLabel: group.label,
    color: group.color,
    closed: formatDateTime(trade.closeTime),
    side: trade.side,
    volume: trade.volume.toFixed(2),
    entry: formatPrice(trade.entry),
    exit: formatPrice(trade.exit),
    held: formatDuration(trade.closeTime - trade.openTime),
    exitReason: EXIT_LABEL[trade.exitReason],
    profit: formatSignedMoney(trade.profit),
    r: formatR(trade.r),
    outcome: outcomeOf(trade.profit),
  };
}

function statItems(stats: TradeStats, withR: boolean): StatItem[] {
  const base: StatItem[] = [
    { label: "Trades", value: String(stats.count) },
    { label: "Win rate", value: formatPercent(stats.winRate) },
    { label: "Net profit", value: formatSignedMoney(stats.net) },
    { label: "Average win", value: stats.avgWin === null ? "–" : formatMoney(stats.avgWin) },
    { label: "Average loss", value: stats.avgLoss === null ? "–" : formatMoney(Math.abs(stats.avgLoss)) },
    { label: "Profit factor", value: formatNumber(stats.profitFactor) },
  ];
  return withR ? [...base, { label: "Average R", value: formatR(stats.avgR) }, { label: "Total R", value: formatR(stats.totalR) }] : base;
}

function verdictText(stats: TradeStats, backtest: Backtest): string {
  switch (verdict(stats.totalR, stats.rCount, backtest)) {
    case "too-early":
      return `${stats.rCount} of ${MIN_TRADES_TO_JUDGE} trades needed before the live result says anything about the edge.`;
    case "in-range":
      return "Live results are inside the range the backtest expects.";
    case "below-range":
      return "Live results are below the range the backtest expects. Treat the edge as unconfirmed.";
    case "above-range":
      return "Live results are above the range the backtest expects. Likely a lucky run, not a bigger edge.";
  }
}

function edgePoints(trades: Trade[]): EdgePoint[] {
  let cumulative = 0;
  return trades
    .filter((trade): trade is Trade & { r: number } => trade.r !== null)
    .map((trade, index) => {
      cumulative += trade.r;
      return { n: index + 1, r: trade.r, cumulative, label: formatDateTime(trade.closeTime) };
    });
}

function comparisonFor(trades: Trade[], stats: TradeStats, backtest: Backtest | null): SetupView["comparison"] {
  if (!backtest) return null;
  return {
    verdict: verdictText(stats, backtest),
    description: backtest.description,
    rows: [
      { metric: "Trades", live: String(stats.count), backtest: String(backtest.trades) },
      { metric: "Win rate", live: formatPercent(stats.winRate), backtest: formatPercent(backtest.winRate) },
      { metric: "Average per trade", live: formatR(stats.avgR), backtest: formatR(backtest.avgR) },
      { metric: "Trades per month", live: stats.count ? formatNumber(stats.tradesPerMonth, 1) : "–", backtest: backtest.tradesPerMonth.toFixed(1) },
      { metric: "Worst drawdown", live: stats.rCount ? `${stats.maxDrawdownR.toFixed(1)}R` : "–", backtest: `${backtest.maxDrawdownR}R` },
      { metric: "Longest losing streak", live: stats.count ? String(stats.longestLosingStreak) : "–", backtest: String(backtest.longestLosingStreak) },
    ],
    live: edgePoints(trades),
    expected: expectedPath(Math.max(MIN_CHART_TRADES, stats.rCount + 10), backtest),
  };
}

function statusOf(ea: EaState, nowSeconds: number): SetupView["status"] {
  const age = nowSeconds - ea.receivedAt;
  const detail = `Last report ${formatAge(age)}`;
  if (age > STALE_AFTER_SECONDS) return { state: "down", label: "Silent", detail };
  if (!ea.algo_enabled) return { state: "down", label: "Algo Trading off", detail };
  return { state: "running", label: "Running", detail };
}

function signalRow(signal: Signal, group: Group | undefined): SignalRow {
  const traded = signal.action === "traded";
  return {
    key: `${signal.magic}:${signal.time}:${signal.dir}`,
    time: formatDateTime(signal.time),
    setup: group?.label ?? String(signal.magic),
    color: group?.color ?? MANUAL_GROUP.color,
    dir: signal.dir,
    close: formatPrice(signal.close),
    ratio: signal.ratio.toFixed(2),
    action: signal.action,
    detail: traded ? `${signal.lots.toFixed(2)} lots, stop ${formatPrice(signal.stop)}, target ${formatPrice(signal.target)}` : signal.reason,
  };
}

function pnlPoints(trades: Trade[], groups: Group[]): PnlPoint[] {
  let totals: Record<string, number> = Object.fromEntries(groups.map((g) => [g.key, 0]));
  return trades.map((trade) => {
    totals = { ...totals, [trade.source]: (totals[trade.source] ?? 0) + trade.profit };
    return { time: trade.closeTime, label: formatDateTime(trade.closeTime), source: trade.source, profit: trade.profit, totals };
  });
}

export function buildView(data: DashboardData, nowSeconds: number, retired: readonly number[] = []) {
  const { snapshot, deals } = data;
  const isRetired = (magic: number) => retired.includes(magic);
  // Only setups that reported themselves count; a backfill cannot speak for the EA.
  const eas = data.eas.filter((ea) => ea.source === "ea" && !isRetired(ea.magic));
  const signals = data.signals.filter((s) => !isRetired(s.magic));
  const groups = buildGroups(eas);
  const groupOf = (key: string): Group => groups.find((g) => g.key === key) ?? MANUAL_GROUP;
  // Retired setups still claim their trades, so those drop out instead of turning manual.
  const trades = buildTrades(deals, [...eas.map((ea) => ea.magic), ...retired]).filter((t) => !isRetired(Number(t.source)));
  const since = firstActivity(deals);
  const tradesOf = (key: string) => trades.filter((t) => t.source === key);
  const statsOf = (key: string) => computeStats(key === ALL ? trades : tradesOf(key), nowSeconds, since);
  const balance = snapshot?.account.balance ?? 0;

  const cash = cashFlow(deals);
  const tradingResult = snapshot ? balance - cash.net : 0;
  const manualNet = statsOf(MANUAL).net;

  const setups: SetupView[] = eas.map((ea) => {
    const group = groupOf(String(ea.magic));
    const setupTrades = tradesOf(group.key);
    const stats = statsOf(group.key);
    return {
      ...group,
      market: `${ea.symbol} · ${ea.timeframe}`,
      status: statusOf(ea, nowSeconds),
      risk: `${ea.risk_pct}% per trade`,
      riskMoney: formatMoney((balance * ea.risk_pct) / 100),
      filterOn: ea.use_vol,
      ratio: ea.ratio,
      ratioMin: ea.vol_min,
      lossesToday: ea.losses_today,
      net: formatSignedMoney(stats.net),
      netOutcome: outcomeOf(stats.net),
      comparison: comparisonFor(setupTrades, stats, backtestFor(ea.timeframe)),
    };
  });

  const stats: Record<string, StatItem[]> = Object.fromEntries([
    ...groups.map((g) => [g.key, statItems(statsOf(g.key), g.key !== MANUAL)] as const),
    [ALL, statItems(statsOf(ALL), false)] as const,
  ]);

  const positions: PositionRow[] = (snapshot?.positions ?? []).map((p) => ({
    ticket: p.ticket,
    group: groupOf(String(p.magic)),
    side: p.type,
    volume: p.volume.toFixed(2),
    entry: formatPrice(p.price_open),
    sl: formatPrice(p.sl),
    tp: formatPrice(p.tp),
    current: formatPrice(p.price_current),
    profit: formatSignedMoney(p.profit + p.swap),
    outcome: outcomeOf(p.profit + p.swap),
    opened: formatDateTime(p.time),
  }));

  return {
    hasData: snapshot !== null,
    groups,
    setups,
    accountDetail: snapshot
      ? `Account data ${snapshot.source === "backfill" ? "loaded from MT5" : "reported"} ${formatAge(nowSeconds - snapshot.receivedAt)}`
      : "No data yet",
    account: snapshot && {
      name: `${snapshot.account.server} · ${snapshot.account.login}`,
      balance: formatMoney(balance),
      equity: formatMoney(snapshot.account.equity),
      deposits: formatMoney(cash.net),
      total: formatSignedMoney(tradingResult),
      totalOutcome: outcomeOf(tradingResult),
      manual: formatSignedMoney(manualNet),
      manualOutcome: outcomeOf(manualNet),
    },
    cash: {
      hasMoves: cash.moves.length > 0,
      deposited: formatMoney(cash.deposited),
      withdrawn: formatMoney(cash.withdrawn),
      adjustments: cash.adjustments === 0 ? null : formatSignedMoney(cash.adjustments),
      net: formatMoney(cash.net),
      balance: snapshot ? formatMoney(balance) : "–",
      result: formatSignedMoney(tradingResult),
      resultOutcome: outcomeOf(tradingResult),
      summary: !snapshot
        ? ""
        : cash.net <= 0
          ? `You have withdrawn ${formatMoney(-cash.net)} more than you deposited, and ${formatMoney(balance)} is still in the account.`
          : `Of the ${formatMoney(cash.net)} of your own money still in, ${formatMoney(balance)} is left.`,
      rows: [...cash.moves].reverse().map(
        (m): CashRow => ({ ticket: m.ticket, time: formatDateTime(m.time), kind: m.kind, amount: formatSignedMoney(m.amount), note: m.note || "–" }),
      ),
    },
    calendar: {
      days: dailyResults(trades),
      groups,
      firstMonth: dayKey(trades[0]?.closeTime ?? nowSeconds).slice(0, 7),
      lastMonth: dayKey(nowSeconds).slice(0, 7),
      today: dayKey(nowSeconds),
    },
    positions,
    pnl: {
      series: groups,
      points: pnlPoints(trades, groups),
      startTime: since ?? nowSeconds - 86400,
      endTime: nowSeconds,
      startLabel: formatDate(since ?? nowSeconds - 86400),
      endLabel: "Now",
    },
    tradeRows: trades.map((trade) => tradeRow(trade, groupOf(trade.source))),
    stats,
    signals: [...signals].reverse().slice(0, MAX_SIGNAL_ROWS).map((s) => signalRow(s, groups.find((g) => g.key === String(s.magic)))),
    signalCounts: {
      total: signals.length,
      traded: signals.filter((s) => s.action === "traded").length,
    },
  };
}

export type DashboardView = ReturnType<typeof buildView>;
