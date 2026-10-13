import { describe, expect, test } from "vitest";
import { createSessionToken, isValidSessionToken, safeEqual, SESSION_SECONDS } from "./auth";
import { expectedPath, MIN_TRADES_TO_JUDGE, verdict } from "./benchmark";
import { normalizeReport, serverOffset } from "./normalize";
import { buildTrades, cashFlow, computeStats } from "./trades";
import { reportSchema, type Deal, type Report } from "./types";

const EA_MAGIC = 20261013;
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
    const trades = buildTrades(roundTrip(7, EA_MAGIC, 88, 44, 5000), EA_MAGIC);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ id: 7, source: "ea", side: "buy", profit: 88, r: 2, exitReason: "target" });
  });

  test("treats a trade without the EA's magic number as manual, with no R when it had no stop", () => {
    const trades = buildTrades(roundTrip(3, 0, -45, 0, 5000), EA_MAGIC);

    expect(trades[0]).toMatchObject({ source: "manual", r: null, exitReason: "stop" });
  });

  test("leaves out positions that are still open and balance operations", () => {
    const deals = [deal({ ticket: 1, position_id: 9 }), deal({ ticket: 2, position_id: 0, type: "balance", entry: "none", profit: 500 })];

    expect(buildTrades(deals, EA_MAGIC)).toEqual([]);
  });

  test("includes swap and commission in the trade's profit", () => {
    const [open, close] = roundTrip(4, EA_MAGIC, 50, 25, 5000);
    const trades = buildTrades([open, { ...close, swap: -2, commission: -3 }], EA_MAGIC);

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
    EA_MAGIC,
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
    const path = expectedPath(100);

    expect(path[0]).toEqual({ n: 0, expected: 0, low: 0, high: 0 });
    expect(path[100].expected).toBeCloseTo(17.6, 5);
    expect(path[100].high - path[100].low).toBeCloseTo(4 * 1.41 * 10, 5);
  });

  test("does not judge the edge before enough trades exist", () => {
    expect(verdict(-20, MIN_TRADES_TO_JUDGE - 1)).toBe("too-early");
    expect(verdict(-40, 60)).toBe("below-range");
    expect(verdict(10, 60)).toBe("in-range");
    expect(verdict(60, 60)).toBe("above-range");
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
    ea: { symbol: "XAUUSD-STD", timeframe: "M15", risk_pct: 9, use_vol: true, vol_min: 1.2, magic: EA_MAGIC, ratio: 1.1, losses_today: 0, algo_enabled: true },
    positions: [],
    deals: [deal({ time: 1_000_000 + 3 * 3600 })],
    signals: [{ time: 1_000_900 + 3 * 3600, dir: "buy", close: 4180, atr: 7, ratio: 1.23, action: "traded", reason: "", lots: 0.03, stop: 4165, target: 4209 }],
  };

  test("snaps the server offset to the half hour despite clock jitter", () => {
    expect(serverOffset(report.time)).toBe(3 * 3600);
  });

  test("converts deal and signal times from server time to UTC", () => {
    const { deals, signals, snapshot } = normalizeReport(report, 42);

    expect(deals[0].time).toBe(1_000_000);
    expect(signals[0].time).toBe(1_000_900);
    expect(snapshot.receivedAt).toBe(42);
  });

  test("the schema rejects an oversized or malformed report", () => {
    expect(reportSchema.safeParse(report).success).toBe(true);
    expect(reportSchema.safeParse({ ...report, v: 2 }).success).toBe(false);
    expect(reportSchema.safeParse({ ...report, deals: Array.from({ length: 501 }, () => report.deals[0]) }).success).toBe(false);
    expect(reportSchema.safeParse({ ...report, account: { ...report.account, balance: "500" } }).success).toBe(false);
  });
});
