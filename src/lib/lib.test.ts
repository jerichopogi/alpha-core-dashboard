import { describe, expect, test } from "vitest";
import { createSessionToken, isValidSessionToken, safeEqual, SESSION_SECONDS } from "./auth";
import { BACKTESTS, expectedPath, MIN_TRADES_TO_JUDGE, verdict } from "./benchmark";
import { buildGroups } from "./groups";
import { dailyResults, dayKey, monthGrid, shiftMonth } from "./calendar";
import { normalizeReport, serverOffset } from "./normalize";
import { keepsCurrentEa, keepsCurrentSnapshot, STALE_AFTER_SECONDS } from "./snapshot";
import { buildTrades, cashFlow, computeStats } from "./trades";
import { reportSchema, type Deal, type EaState, type Report, type Snapshot } from "./types";
import { buildView } from "./view";

const EA_MAGIC = 20261013;
const EA = String(EA_MAGIC);
const SECOND_MAGIC = 20261014;
const SECRET = "x".repeat(40);

function deal(overrides: Partial<Deal>): Deal {
  return {
    ticket: 1,
    position_id: 1,
    time: 1000,
    type: "buy",
    entry: "in",
    symbol: "XAUUSD-STD",
    volume: 0.03,
    price: 4180,
    profit: 0,
    swap: 0,
    commission: 0,
    fee: 0,
    magic: 0,
    comment: "",
    sl: 0,
    tp: 0,
    risk: 0,
    ...overrides,
  };
}

function roundTrip(id: number, magic: number, profit: number, risk: number, closeTime: number): Deal[] {
  return [
    deal({ ticket: id * 10, position_id: id, time: closeTime - 600, magic, risk, sl: 4165 }),
    deal({ ticket: id * 10 + 1, position_id: id, time: closeTime, type: "sell", entry: "out", profit, comment: profit > 0 ? "[tp 4209]" : "[sl 4165]" }),
  ];
}

describe("buildTrades", () => {
  test("pairs an entry with its exit and labels EA trades by the entry's magic number", () => {
    const trades = buildTrades(roundTrip(7, EA_MAGIC, 88, 44, 5000), [EA_MAGIC]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ id: 7, source: EA, side: "buy", profit: 88, r: 2, exitReason: "target" });
  });

  test("treats a trade without the EA's magic number as manual, with no R when it had no stop", () => {
    const trades = buildTrades(roundTrip(3, 0, -45, 0, 5000), [EA_MAGIC]);

    expect(trades[0]).toMatchObject({ source: "manual", r: null, exitReason: "stop" });
  });

  test("leaves out positions that are still open and balance operations", () => {
    const deals = [deal({ ticket: 1, position_id: 9 }), deal({ ticket: 2, position_id: 0, type: "balance", entry: "none", profit: 500 })];

    expect(buildTrades(deals, [EA_MAGIC])).toEqual([]);
  });

  test("includes swap and commission in the trade's profit", () => {
    const [open, close] = roundTrip(4, EA_MAGIC, 50, 25, 5000);
    const trades = buildTrades([open, { ...close, swap: -2, commission: -3 }], [EA_MAGIC]);

    expect(trades[0].profit).toBe(45);
  });
});

describe("computeStats", () => {
  const trades = buildTrades(
    [
      ...roundTrip(1, EA_MAGIC, 80, 40, 1000),
      ...roundTrip(2, EA_MAGIC, -40, 40, 2000),
      ...roundTrip(3, EA_MAGIC, -40, 40, 3000),
      ...roundTrip(4, EA_MAGIC, 80, 40, 4000),
    ],
    [EA_MAGIC],
  );

  test("reports win rate, R totals, drawdown and losing streak", () => {
    const stats = computeStats(trades, 4000, null);

    expect(stats).toMatchObject({ count: 4, wins: 2, winRate: 0.5, net: 80, totalR: 2, avgR: 0.5, maxDrawdownR: 2, longestLosingStreak: 2 });
    expect(stats.profitFactor).toBe(2);
  });

  test("withholds trades per month until a week of history exists", () => {
    expect(computeStats(trades, 86400 * 3, 0).tradesPerMonth).toBeNull();
    expect(computeStats(trades, 86400 * 30.4375, 0).tradesPerMonth).toBeCloseTo(4, 5);
  });

  test("returns empty values, not NaN, when there are no trades", () => {
    expect(computeStats([], 1000, null)).toMatchObject({ count: 0, winRate: null, avgR: null, profitFactor: null, net: 0 });
  });
});

describe("cashFlow", () => {
  const balance = (ticket: number, profit: number, comment: string) => deal({ ticket, type: "balance", entry: "none", profit, comment });

  test("totals deposits and withdrawals separately and nets them", () => {
    const flow = cashFlow([balance(1, 500, "Deposit-Maya-CPS"), balance(2, -120, "Withdraw-CC"), balance(3, 300, "CC Deposit-Bridger")]);

    expect(flow).toMatchObject({ deposited: 800, withdrawn: 120, adjustments: 0, net: 680 });
    expect(flow.moves.map((m) => m.kind)).toEqual(["deposit", "withdrawal", "deposit"]);
  });

  test("keeps a broker credit out of deposits but inside the net", () => {
    const flow = cashFlow([balance(1, 300, "Deposit-Maya-CPS"), balance(2, 1.25, "Cash Adjustment-Debt W/O")]);

    expect(flow).toMatchObject({ deposited: 300, withdrawn: 0, adjustments: 1.25, net: 301.25 });
  });

  test("counts an unlabelled debit as a withdrawal and ignores trades", () => {
    const flow = cashFlow([balance(1, -50, ""), deal({ ticket: 2, profit: 99 })]);

    expect(flow).toMatchObject({ deposited: 0, withdrawn: 50, net: -50 });
    expect(flow.moves).toHaveLength(1);
  });
});

describe("benchmark", () => {
  test("expected path starts at zero and widens with the square root of the trade count", () => {
    const path = expectedPath(100, BACKTESTS.M15);

    expect(path[0]).toEqual({ n: 0, expected: 0, low: 0, high: 0 });
    expect(path[100].expected).toBeCloseTo(19.5, 5);
    expect(path[100].high - path[100].low).toBeCloseTo(4 * 1.41 * 10, 5);
  });

  test("does not judge the edge before enough trades exist", () => {
    expect(verdict(-20, MIN_TRADES_TO_JUDGE - 1, BACKTESTS.M15)).toBe("too-early");
    expect(verdict(-40, 60, BACKTESTS.M15)).toBe("below-range");
    expect(verdict(10, 60, BACKTESTS.M15)).toBe("in-range");
    expect(verdict(60, 60, BACKTESTS.M15)).toBe("above-range");
  });
});

describe("session tokens", () => {
  test("accepts a fresh token and rejects it after it expires", () => {
    const token = createSessionToken(1000, SECRET);

    expect(isValidSessionToken(token, 1001, SECRET)).toBe(true);
    expect(isValidSessionToken(token, 1000 + SESSION_SECONDS, SECRET)).toBe(false);
  });

  test("rejects a token whose expiry was changed, or one signed with another secret", () => {
    const token = createSessionToken(1000, SECRET);
    const [, signature] = token.split(".");

    expect(isValidSessionToken(`9999999999.${signature}`, 1001, SECRET)).toBe(false);
    expect(isValidSessionToken(token, 1001, "y".repeat(40))).toBe(false);
    expect(isValidSessionToken(undefined, 1001, SECRET)).toBe(false);
    expect(isValidSessionToken("garbage", 1001, SECRET)).toBe(false);
  });

  test("safeEqual compares values of different lengths without throwing", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("normalizeReport", () => {
  const report: Report = {
    v: 1,
    source: "ea",
    time: { server: 1_000_000 + 3 * 3600 + 4, gmt: 1_000_000 },
    account: { login: 1, server: "Demo", currency: "USD", balance: 500, equity: 500, margin_free: 500, leverage: 2000 },
    ea: { name: "AlphaCore", symbol: "XAUUSD-STD", timeframe: "M15", risk_pct: 9, use_vol: true, vol_min: 1.2, magic: EA_MAGIC, ratio: 1.1, losses_today: 0, algo_enabled: true },
    positions: [],
    deals: [deal({ time: 1_000_000 + 3 * 3600 })],
    signals: [{ time: 1_000_900 + 3 * 3600, dir: "buy", close: 4180, atr: 7, ratio: 1.23, action: "traded", reason: "", lots: 0.03, stop: 4165, target: 4209 }],
  };

  test("snaps the server offset to the half hour despite clock jitter", () => {
    expect(serverOffset(report.time)).toBe(3 * 3600);
  });

  test("converts deal and signal times from server time to UTC", () => {
    const { deals, signals, snapshot, ea } = normalizeReport(report, 42);

    expect(deals[0].time).toBe(1_000_000);
    expect(signals[0].time).toBe(1_000_900);
    expect(snapshot.receivedAt).toBe(42);
    expect(ea).toMatchObject({ magic: EA_MAGIC, name: "AlphaCore", receivedAt: 42, source: "ea" });
  });

  test("stamps each signal with the reporting setup's magic number", () => {
    expect(normalizeReport(report, 42).signals[0].magic).toBe(EA_MAGIC);
  });

  test("a report without a setup name gets the default one", () => {
    const parsed = reportSchema.parse({ ...report, ea: { ...report.ea, name: undefined } });

    expect(parsed.ea.name).toBe("AlphaCore");
  });

  test("the schema rejects an oversized or malformed report", () => {
    expect(reportSchema.safeParse(report).success).toBe(true);
    expect(reportSchema.safeParse({ ...report, v: 2 }).success).toBe(false);
    expect(reportSchema.safeParse({ ...report, deals: Array.from({ length: 501 }, () => report.deals[0]) }).success).toBe(false);
    expect(reportSchema.safeParse({ ...report, account: { ...report.account, balance: "500" } }).success).toBe(false);
  });
});

describe("keepsCurrentSnapshot", () => {
  const NOW = 10_000;
  const snap = (source: Snapshot["source"], algoEnabled: boolean, receivedAt = NOW - 60): Snapshot => ({
    source,
    receivedAt,
    positions: [],
    account: { login: 1, server: "Demo", currency: "USD", balance: 500, equity: 500, margin_free: 500, leverage: 2000 },
    ea: { name: "AlphaCore", symbol: "XAUUSD-STD", timeframe: "M15", risk_pct: 9, use_vol: true, vol_min: 1.2, magic: EA_MAGIC, ratio: 1.1, losses_today: 0, algo_enabled: algoEnabled },
  });

  test("the first report is always stored", () => {
    expect(keepsCurrentSnapshot(null, snap("backfill", false), NOW)).toBe(false);
  });

  test("a backfill never replaces the EA's own snapshot, but replaces an older backfill", () => {
    expect(keepsCurrentSnapshot(snap("ea", true), snap("backfill", false), NOW)).toBe(true);
    expect(keepsCurrentSnapshot(snap("backfill", false), snap("backfill", false), NOW)).toBe(false);
  });

  test("a copy of the EA with trading off does not replace a live EA's fresh snapshot", () => {
    expect(keepsCurrentSnapshot(snap("ea", true), snap("ea", false), NOW)).toBe(true);
  });

  test("a trading-off report is stored once the live EA has gone silent, so the status can change", () => {
    const silent = snap("ea", true, NOW - STALE_AFTER_SECONDS - 1);

    expect(keepsCurrentSnapshot(silent, snap("ea", false), NOW)).toBe(false);
  });

  test("the live EA's report always replaces the snapshot", () => {
    expect(keepsCurrentSnapshot(snap("ea", false), snap("ea", true), NOW)).toBe(false);
    expect(keepsCurrentSnapshot(snap("ea", true), snap("ea", true), NOW)).toBe(false);
  });
});

describe("calendar", () => {
  // 2026-10-13 18:00 UTC is already 02:00 on the 14th in the Philippines.
  const LATE_13TH_UTC = Date.UTC(2026, 9, 13, 18, 0) / 1000;
  const NOON_13TH_UTC = Date.UTC(2026, 9, 13, 4, 0) / 1000;

  test("dayKey uses the Philippine date, not the UTC one", () => {
    expect(dayKey(NOON_13TH_UTC)).toBe("2026-10-13");
    expect(dayKey(LATE_13TH_UTC)).toBe("2026-10-14");
  });

  test("dailyResults groups trades by closing day and splits EA from manual", () => {
    const trades = buildTrades(
      [...roundTrip(1, EA_MAGIC, 80, 40, NOON_13TH_UTC), ...roundTrip(2, 0, -30, 0, NOON_13TH_UTC + 60), ...roundTrip(3, 0, 20, 0, LATE_13TH_UTC)],
      [EA_MAGIC],
    );

    expect(dailyResults(trades)).toEqual([
      { date: "2026-10-13", total: 50, bySource: { [EA]: 80, manual: -30 }, trades: 2, wins: 1 },
      { date: "2026-10-14", total: 20, bySource: { manual: 20 }, trades: 1, wins: 1 },
    ]);
  });

  test("monthGrid starts weeks on Monday and pads both ends", () => {
    const grid = monthGrid("2026-10"); // 1 October 2026 is a Thursday

    expect(grid.weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks[4]).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", null]);
  });

  test("shiftMonth crosses year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("several setups on one account", () => {
  const NOW = 2_000_000;
  const ea = (magic: number, name: string, timeframe: string, overrides: Partial<EaState> = {}): EaState => ({
    name,
    symbol: "XAUUSD-STD",
    timeframe,
    risk_pct: 4.5,
    use_vol: true,
    vol_min: 1.2,
    magic,
    ratio: 1.3,
    losses_today: 0,
    algo_enabled: true,
    source: "ea",
    receivedAt: NOW - 60,
    ...overrides,
  });
  const snapshot: Snapshot = {
    source: "ea",
    receivedAt: NOW - 60,
    positions: [],
    account: { login: 1, server: "Demo", currency: "USD", balance: 600, equity: 600, margin_free: 600, leverage: 2000 },
    ea: ea(EA_MAGIC, "AC 15m", "M15"),
  };
  const deals = [
    deal({ ticket: 900, position_id: 0, type: "balance", entry: "none", profit: 500, time: NOW - 9000, comment: "Deposit" }),
    ...roundTrip(1, EA_MAGIC, 80, 40, NOW - 5000),
    ...roundTrip(2, SECOND_MAGIC, -30, 30, NOW - 4000),
    ...roundTrip(3, 0, 50, 0, NOW - 3000),
  ];

  test("buildGroups gives each setup its own colour and keeps manual on slot 2", () => {
    const groups = buildGroups([ea(EA_MAGIC, "AC 15m", "M15"), ea(SECOND_MAGIC, "AC 3m", "M3")]);

    expect(groups).toEqual([
      { key: EA, label: "AC 15m", color: 1 },
      { key: String(SECOND_MAGIC), label: "AC 3m", color: 3 },
      { key: "manual", label: "Manual", color: 2 },
    ]);
  });

  test("setups that share a name are told apart by timeframe", () => {
    const groups = buildGroups([ea(EA_MAGIC, "AlphaCore", "M15"), ea(SECOND_MAGIC, "AlphaCore", "M3")]);

    expect(groups.map((g) => g.label)).toEqual(["AlphaCore M15", "AlphaCore M3", "Manual"]);
  });

  test("the view splits trades, results and backtests per setup", () => {
    const eas = [ea(EA_MAGIC, "AC 15m", "M15"), ea(SECOND_MAGIC, "AC 3m", "M3")];
    const view = buildView({ snapshot, eas, deals, signals: [], equity: [] }, NOW);

    expect(view.setups.map((s) => [s.label, s.net, s.status.state])).toEqual([
      ["AC 15m", "+$80.00", "running"],
      ["AC 3m", "−$30.00", "running"],
    ]);
    expect(view.account?.manual).toBe("+$50.00");
    expect(view.tradeRows.map((r) => r.sourceLabel)).toEqual(["AC 15m", "AC 3m", "Manual"]);
    expect(view.setups[0].comparison?.rows[0]).toEqual({ metric: "Trades", live: "1", backtest: "429" });
    expect(view.setups[1].comparison?.rows[0]).toEqual({ metric: "Trades", live: "1", backtest: "661" });
    expect(view.pnl.points[2].totals).toEqual({ [EA]: 80, [String(SECOND_MAGIC)]: -30, manual: 50 });
  });

  test("a setup that stopped reporting shows as silent, and one with trading off as down", () => {
    const eas = [ea(EA_MAGIC, "AC 15m", "M15", { receivedAt: NOW - STALE_AFTER_SECONDS - 1 }), ea(SECOND_MAGIC, "AC 3m", "M3", { algo_enabled: false })];
    const view = buildView({ snapshot, eas, deals, signals: [], equity: [] }, NOW);

    expect(view.setups.map((s) => s.status.label)).toEqual(["Silent", "Algo Trading off"]);
  });

  test("trades of a setup that never reported are counted as manual", () => {
    const view = buildView({ snapshot, eas: [ea(EA_MAGIC, "AC 15m", "M15")], deals, signals: [], equity: [] }, NOW);

    expect(view.tradeRows.map((r) => r.sourceLabel)).toEqual(["AC 15m", "Manual", "Manual"]);
  });

  test("a retired setup leaves the page: no card, trades, results or signals, and its trades are not counted as manual", () => {
    const eas = [ea(EA_MAGIC, "AC 15m", "M15"), ea(SECOND_MAGIC, "AC 3m", "M3", { algo_enabled: false })];
    const signal = (magic: number) => ({ time: NOW - 100, dir: "buy" as const, close: 4180, atr: 2, ratio: 1.3, action: "skipped" as const, reason: "x", lots: 0, stop: 0, target: 0, magic });
    const view = buildView({ snapshot, eas, deals, signals: [signal(EA_MAGIC), signal(SECOND_MAGIC)], equity: [] }, NOW, [SECOND_MAGIC]);

    expect(view.setups.map((s) => s.label)).toEqual(["AC 15m"]);
    expect(view.groups.map((g) => g.label)).toEqual(["AC 15m", "Manual"]);
    expect(view.tradeRows.map((r) => r.sourceLabel)).toEqual(["AC 15m", "Manual"]);
    expect(view.account?.manual).toBe("+$50.00");
    expect(view.pnl.points.at(-1)?.totals).toEqual({ [EA]: 80, manual: 50 });
    expect(view.signals.map((s) => s.setup)).toEqual(["AC 15m"]);
    expect(view.signalCounts.total).toBe(1);
  });

  test("keepsCurrentEa: a backfill never sets a setup's state; a trading-off copy cannot replace the live one", () => {
    const live = ea(EA_MAGIC, "AC 15m", "M15");

    expect(keepsCurrentEa(null, ea(EA_MAGIC, "AC 15m", "M15", { source: "backfill" }), NOW)).toBe(true);
    expect(keepsCurrentEa(null, live, NOW)).toBe(false);
    expect(keepsCurrentEa(live, ea(EA_MAGIC, "AC 15m", "M15", { algo_enabled: false }), NOW)).toBe(true);
    expect(keepsCurrentEa({ ...live, receivedAt: NOW - STALE_AFTER_SECONDS - 1 }, ea(EA_MAGIC, "AC 15m", "M15", { algo_enabled: false }), NOW)).toBe(false);
  });
});
