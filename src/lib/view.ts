import type { EdgePoint } from "@/components/EdgeChart";
import type { PnlPoint } from "@/components/PnlChart";
import type { StatItem, TradeFilter, TradeRow } from "@/components/TradesPanel";
import { BACKTEST, expectedPath, MIN_TRADES_TO_JUDGE, verdict, type ExpectedPoint } from "./benchmark";
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
import { dailyResults, dayKey } from "./calendar";
import { STALE_AFTER_SECONDS } from "./snapshot";
import { buildTrades, cashFlow, computeStats, firstActivity, type CashKind, type Trade, type TradeStats } from "./trades";
import type { DashboardData, Signal, Snapshot } from "./types";

const DEFAULT_EA_MAGIC = 20261013;
const MIN_CHART_TRADES = 40;
const MAX_SIGNAL_ROWS = 100;

export interface BenchmarkRow {
  metric: string;
  live: string;
  backtest: string;
}

export interface SignalRow {
  key: string;
  time: string;
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
  source: "ea" | "manual";
  side: "buy" | "sell";
  volume: string;
  entry: string;
  sl: string;
  tp: string;
  current: string;
  profit: string;
  outcome: "win" | "loss" | "flat";
  opened: string;
}

const outcomeOf = (value: number): "win" | "loss" | "flat" => (value > 0 ? "win" : value < 0 ? "loss" : "flat");

const EXIT_LABEL: Record<Trade["exitReason"], string> = { target: "Target", stop: "Stop", other: "Manual or EA close" };

function tradeRow(trade: Trade): TradeRow {
  return {
    id: trade.id,
    source: trade.source,
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

function verdictText(stats: TradeStats): string {
  switch (verdict(stats.totalR, stats.rCount)) {
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

function signalRow(signal: Signal): SignalRow {
  const traded = signal.action === "traded";
  return {
    key: `${signal.time}:${signal.dir}`,
    time: formatDateTime(signal.time),
    dir: signal.dir,
    close: formatPrice(signal.close),
    ratio: signal.ratio.toFixed(2),
    action: signal.action,
    detail: traded ? `${signal.lots.toFixed(2)} lots, stop ${formatPrice(signal.stop)}, target ${formatPrice(signal.target)}` : signal.reason,
  };
}

function pnlPoints(trades: Trade[]): PnlPoint[] {
  const totals = { ea: 0, manual: 0 };
  return trades.map((trade) => {
    totals[trade.source] += trade.profit;
    return { time: trade.closeTime, label: formatDateTime(trade.closeTime), source: trade.source, profit: trade.profit, ea: totals.ea, manual: totals.manual };
  });
}

function edgePoints(eaTrades: Trade[]): EdgePoint[] {
  let cumulative = 0;
  return eaTrades
    .filter((trade): trade is Trade & { r: number } => trade.r !== null)
    .map((trade, index) => {
      cumulative += trade.r;
      return { n: index + 1, r: trade.r, cumulative, label: formatDateTime(trade.closeTime) };
    });
}

export type EaState = "running" | "down" | "unknown";

/** The EA's state comes only from the EA's own reports; a backfill from another terminal cannot know it. */
function eaStatus(snapshot: Snapshot | null, age: number | null): { state: EaState; label: string; detail: string } {
  if (!snapshot || age === null) return { state: "unknown", label: "Waiting for the EA's first report", detail: "No data yet" };
  if (snapshot.source === "backfill") {
    return { state: "unknown", label: "Waiting for the EA's first report", detail: `Account data loaded from MT5 ${formatAge(age)}` };
  }
  const detail = `Last report from the VPS ${formatAge(age)}`;
  if (age > STALE_AFTER_SECONDS) return { state: "down", label: "EA silent", detail };
  if (!snapshot.ea.algo_enabled) return { state: "down", label: "Algo Trading is off on the VPS", detail };
  return { state: "running", label: "EA running on the VPS", detail };
}

export function buildView(data: DashboardData, nowSeconds: number) {
  const { snapshot, deals, signals } = data;
  const magic = snapshot?.ea.magic ?? DEFAULT_EA_MAGIC;
  const trades = buildTrades(deals, magic);
  const eaTrades = trades.filter((t) => t.source === "ea");
  const manualTrades = trades.filter((t) => t.source === "manual");
  const since = firstActivity(deals);

  const eaStats = computeStats(eaTrades, nowSeconds, since);
  const manualStats = computeStats(manualTrades, nowSeconds, since);
  const allStats = computeStats(trades, nowSeconds, since);
  const cash = cashFlow(deals);
  const deposits = cash.net;
  const tradingResult = snapshot ? snapshot.account.balance - cash.net : 0;
  const age = snapshot ? nowSeconds - snapshot.receivedAt : null;

  const benchmark: BenchmarkRow[] = [
    { metric: "Trades", live: String(eaStats.count), backtest: String(BACKTEST.trades) },
    { metric: "Win rate", live: formatPercent(eaStats.winRate), backtest: formatPercent(BACKTEST.winRate) },
    { metric: "Average per trade", live: formatR(eaStats.avgR), backtest: formatR(BACKTEST.avgR) },
    { metric: "Trades per month", live: eaStats.count ? formatNumber(eaStats.tradesPerMonth, 1) : "–", backtest: BACKTEST.tradesPerMonth.toFixed(1) },
    { metric: "Worst drawdown", live: eaStats.rCount ? `${eaStats.maxDrawdownR.toFixed(1)}R` : "–", backtest: `${BACKTEST.maxDrawdownR}R` },
    { metric: "Longest losing streak", live: eaStats.count ? String(eaStats.longestLosingStreak) : "–", backtest: String(BACKTEST.longestLosingStreak) },
  ];

  const expected: ExpectedPoint[] = expectedPath(Math.max(MIN_CHART_TRADES, eaStats.rCount + 10));
  const stats: Record<TradeFilter, StatItem[]> = {
    ea: statItems(eaStats, true),
    manual: statItems(manualStats, false),
    all: statItems(allStats, false),
  };

  const positions: PositionRow[] = (snapshot?.positions ?? []).map((p) => ({
    ticket: p.ticket,
    source: p.magic === magic ? "ea" : "manual",
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
    status: eaStatus(snapshot, age),
    account: snapshot && {
      name: `${snapshot.account.server} · ${snapshot.account.login}`,
      balance: formatMoney(snapshot.account.balance),
      equity: formatMoney(snapshot.account.equity),
      deposits: formatMoney(deposits),
      total: formatSignedMoney(snapshot.account.balance - deposits),
      totalOutcome: outcomeOf(snapshot.account.balance - deposits),
      ea: formatSignedMoney(eaStats.net),
      eaOutcome: outcomeOf(eaStats.net),
      manual: formatSignedMoney(manualStats.net),
      manualOutcome: outcomeOf(manualStats.net),
    },
    market: snapshot ? `${snapshot.ea.symbol} · ${snapshot.ea.timeframe}` : "XAUUSD",
    // Only the EA knows its own settings and the current ratio; a backfill does not.
    ea: !snapshot || snapshot.source === "backfill" ? null : {
      market: `${snapshot.ea.symbol} · ${snapshot.ea.timeframe}`,
      risk: `${snapshot.ea.risk_pct}% per trade`,
      riskMoney: formatMoney((snapshot.account.balance * snapshot.ea.risk_pct) / 100),
      filterOn: snapshot.ea.use_vol,
      ratio: snapshot.ea.ratio,
      ratioMin: snapshot.ea.vol_min,
      lossesToday: snapshot.ea.losses_today,
    },
    cash: {
      hasMoves: cash.moves.length > 0,
      deposited: formatMoney(cash.deposited),
      withdrawn: formatMoney(cash.withdrawn),
      adjustments: cash.adjustments === 0 ? null : formatSignedMoney(cash.adjustments),
      net: formatMoney(cash.net),
      balance: snapshot ? formatMoney(snapshot.account.balance) : "–",
      result: formatSignedMoney(tradingResult),
      resultOutcome: outcomeOf(tradingResult),
      summary: !snapshot
        ? ""
        : cash.net <= 0
          ? `You have withdrawn ${formatMoney(-cash.net)} more than you deposited, and ${formatMoney(snapshot.account.balance)} is still in the account.`
          : `Of the ${formatMoney(cash.net)} of your own money still in, ${formatMoney(snapshot.account.balance)} is left.`,
      rows: [...cash.moves].reverse().map(
        (m): CashRow => ({ ticket: m.ticket, time: formatDateTime(m.time), kind: m.kind, amount: formatSignedMoney(m.amount), note: m.note || "–" }),
      ),
    },
    calendar: {
      days: dailyResults(trades),
      firstMonth: dayKey(trades[0]?.closeTime ?? nowSeconds).slice(0, 7),
      lastMonth: dayKey(nowSeconds).slice(0, 7),
      today: dayKey(nowSeconds),
    },
    positions,
    benchmark,
    verdict: verdictText(eaStats),
    edge: { live: edgePoints(eaTrades), expected },
    pnl: {
      points: pnlPoints(trades),
      startTime: since ?? nowSeconds - 86400,
      endTime: nowSeconds,
      startLabel: formatDate(since ?? nowSeconds - 86400),
      endLabel: "Now",
    },
    tradeRows: trades.map(tradeRow),
    stats,
    signals: [...signals].reverse().slice(0, MAX_SIGNAL_ROWS).map(signalRow),
    signalCounts: {
      total: signals.length,
      traded: signals.filter((s) => s.action === "traded").length,
    },
  };
}

export type DashboardView = ReturnType<typeof buildView>;
