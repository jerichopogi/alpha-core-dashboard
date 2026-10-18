import { describe, expect, test } from "vitest";
import { balanceHistory, byHour, bySide, byWeekday, drawdownOf, monthlyResults, openRisks, rHistogram, streaks } from "./analytics";
import { MANUAL, type Trade } from "./trades";
import type { Deal, Position } from "./types";

const HOUR = 3600;
// 2026-10-12 00:00 UTC is a Monday, 08:00 in the Philippines.
const MONDAY = 1_791_763_200;

function deal(overrides: Partial<Deal>): Deal {
  return {
    ticket: 1, position_id: 1, time: MONDAY, type: "buy", entry: "in", symbol: "XAUUSD", volume: 0.1, price: 4000,
    profit: 0, swap: 0, commission: 0, fee: 0, magic: 0, comment: "", sl: 0, tp: 0, risk: 0, ...overrides,
  };
}

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: 1, source: MANUAL, symbol: "XAUUSD", side: "buy", volume: 0.1, openTime: MONDAY, closeTime: MONDAY + HOUR,
    entry: 4000, exit: 4010, sl: 3990, tp: 4020, profit: 10, r: 1, exitReason: "other", ...overrides,
  };
}

describe("balanceHistory", () => {
  test("works back from today's balance, so missing early history cannot shift the curve", () => {
    const deals = [
      deal({ ticket: 1, type: "balance", entry: "none", profit: 1000, time: MONDAY, comment: "Deposit" }),
      deal({ ticket: 2, time: MONDAY + HOUR, entry: "out", type: "sell", profit: 50, commission: -2 }),
      deal({ ticket: 3, time: MONDAY + 2 * HOUR, entry: "out", type: "sell", profit: -100 }),
    ];
    const points = balanceHistory(deals, 948);

    expect(points.map((p) => p.balance)).toEqual([0, 1000, 1048, 948]);
    expect(points.map((p) => p.result)).toEqual([0, 0, 48, -52]);
  });
});

describe("drawdownOf", () => {
  test("measures the fall from the best trading result, in money and against the balance at that peak", () => {
    const dd = drawdownOf([
      { time: 1, balance: 1000, result: 0 },
      { time: 2, balance: 1200, result: 200 },
      { time: 3, balance: 900, result: -100 },
      { time: 4, balance: 1100, result: 100 },
    ]);

    expect(dd.max).toBe(300);
    expect(dd.maxPct).toBeCloseTo(0.25);
    expect(dd.current).toBe(100);
    expect(dd.currentPct).toBeCloseTo(100 / 1200);
    expect(dd.series.map((p) => p.drawdown)).toEqual([0, 0, 300, 100]);
  });

  test("deposits and withdrawals never move the drawdown percentage", () => {
    const dd = drawdownOf([
      { time: 1, balance: 500, result: 0 },
      { time: 2, balance: 700, result: 200 },
      { time: 3, balance: 2700, result: 200 }, // deposit of 2,000
      { time: 4, balance: 1700, result: -800 },
    ]);
    expect(dd.current).toBe(1000);
    expect(dd.currentPct).toBeCloseTo(1000 / 2700);
    const withdrawn = drawdownOf([
      { time: 1, balance: 1000, result: 0 },
      { time: 2, balance: 900, result: -100 },
      { time: 3, balance: 10, result: -100 }, // withdrew 890
    ]);
    expect(withdrawn.currentPct).toBeCloseTo(0.1);
  });

  test("after the account is emptied, a new deposit starts a fresh run but the worst stays", () => {
    const dd = drawdownOf([
      { time: 1, balance: 100, result: 0 },
      { time: 2, balance: 0.12, result: -99.88 }, // wiped out, cents left
      { time: 3, balance: 200.12, result: -99.88 }, // new deposit
      { time: 4, balance: 150.12, result: -149.88 },
    ]);
    expect(dd.currentPct).toBeCloseTo(50 / 200.12);
    expect(dd.maxPct).toBeCloseTo(0.9988);
    expect(dd.current).toBeCloseTo(50);
    expect(dd.max).toBeCloseTo(99.88);
    expect(dd.runMaxPct).toBeCloseTo(50 / 200.12);
  });

  test("a curve that only rises has no drawdown", () => {
    const dd = drawdownOf([{ time: 1, balance: 100, result: 0 }, { time: 2, balance: 150, result: 50 }]);
    expect([dd.max, dd.current, dd.currentPct]).toEqual([0, 0, 0]);
  });
});

describe("openRisks", () => {
  const position = (overrides: Partial<Position>): Position => ({
    ticket: 7, symbol: "XAUUSD", type: "buy", volume: 0.1, price_open: 4000, price_current: 4010, sl: 3980, tp: 4040,
    profit: 100, swap: 0, magic: 20261013, comment: "", time: MONDAY, ...overrides,
  });

  test("takes the money at risk from the opening deal and places price between stop and target", () => {
    const [risk] = openRisks([position({})], [deal({ position_id: 7, risk: 200 })]);

    expect(risk.riskMoney).toBe(200);
    expect(risk.rNow).toBeCloseTo(0.5);
    expect(risk.progress).toBeCloseTo(0.5); // 4010 is halfway from 3980 to 4040
  });

  test("works the risk out from the open profit when the opening deal is missing, and mirrors shorts", () => {
    const [risk] = openRisks([position({ type: "sell", price_current: 3990, sl: 4020, tp: 3960, profit: 100 })], []);

    expect(risk.riskMoney).toBeCloseTo(200); // $10 per point, 20 points to the stop
    expect(risk.progress).toBeCloseTo(0.5);
  });

  test("a position with no stop has unknown risk", () => {
    const [risk] = openRisks([position({ sl: 0 })], []);
    expect([risk.riskMoney, risk.rNow, risk.progress, risk.noStop]).toEqual([null, null, null, true]);
  });

  test("money at risk follows the current stop; R stays against the original risk", () => {
    const opening = deal({ position_id: 7, price: 4000, sl: 3980, volume: 0.1, risk: 200 });
    const [breakeven] = openRisks([position({ sl: 4000 })], [opening]);
    expect(breakeven.riskMoney).toBe(0);
    expect(breakeven.rNow).toBeCloseTo(0.5);

    const [half] = openRisks([position({ volume: 0.05, profit: 50 })], [opening]);
    expect(half.riskMoney).toBeCloseTo(100); // half the lots left
  });

  test("a stop at the entry with no price move yet is known risk, not a missing stop", () => {
    const [risk] = openRisks([position({ price_current: 4000, profit: 0, sl: 3980 })], [deal({ position_id: 7, price: 4000, sl: 3980, risk: 200 })]);
    expect(risk.noStop).toBe(false);
    expect(risk.riskMoney).toBe(200);
  });

  test("progress and entry stay on the bar after a trailed stop", () => {
    const [risk] = openRisks([position({ sl: 4005, price_current: 4010 })], []);
    expect(risk.entryAt).toBe(0);
  });
});

describe("breakdowns", () => {
  const trades = [
    trade({ id: 1, openTime: MONDAY, profit: 30, r: 1.5 }), // Monday 08:00 PH
    trade({ id: 2, openTime: MONDAY + HOUR, profit: -20, r: -1, side: "sell" }), // Monday 09:00 PH
    trade({ id: 3, openTime: MONDAY + 24 * HOUR, profit: 10, r: 0.5 }), // Tuesday 08:00 PH
  ];

  test("by Philippine hour of entry", () => {
    const hours = byHour(trades);
    expect(hours).toHaveLength(24);
    expect(hours[8]).toMatchObject({ label: "08", trades: 2, wins: 2, net: 40 });
    expect(hours[9]).toMatchObject({ trades: 1, wins: 0, net: -20, avgR: -1 });
  });

  test("by Philippine weekday, Monday first", () => {
    const days = byWeekday(trades);
    expect(days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(days[0]).toMatchObject({ trades: 2, net: 10 });
    expect(days[1]).toMatchObject({ trades: 1, net: 10 });
  });

  test("long against short", () => {
    const [long, short] = bySide(trades);
    expect(long).toMatchObject({ label: "Long", trades: 2, wins: 2, net: 40, avgR: 1 });
    expect(short).toMatchObject({ label: "Short", trades: 1, net: -20 });
  });

  test("R distribution in half-R bins with open ends", () => {
    const bins = rHistogram([...trades, trade({ id: 4, r: -2.2 }), trade({ id: 5, r: 3.4 }), trade({ id: 6, r: null })]);
    const count = (label: string) => bins.find((b) => b.label === label)?.trades;
    expect(bins[0].label).toBe("< −1.5");
    expect(bins[bins.length - 1].label).toBe("≥ 3");
    expect([count("< −1.5"), count("−1 to −0.5"), count("0.5 to 1"), count("1.5 to 2"), count("≥ 3")]).toEqual([1, 1, 1, 1, 1]);
  });

  test("monthly results by the Philippine month of closing", () => {
    expect(monthlyResults(trades)).toEqual([{ month: "2026-10", net: 20, trades: 3, wins: 2 }]);
  });

  test("streaks", () => {
    const s = streaks([trade({ profit: 1 }), trade({ profit: 2 }), trade({ profit: -1 }), trade({ profit: 3 }), trade({ profit: 4 }), trade({ profit: 5 })]);
    expect(s).toEqual({ current: 3, currentKind: "win", longestWin: 3, longestLoss: 1 });
  });
});
