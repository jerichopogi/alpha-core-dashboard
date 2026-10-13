/**
 * What the backtest of the live configuration produced: XAUUSD 15m, volatility
 * filter 1.2, stop 2 x ATR, target 1:2, 438 trades from 2021-01 to 2026-10,
 * costs 0.35 per ounce. The live edge is expected to be smaller than this.
 */
export const BACKTEST = {
  trades: 438,
  winRate: 0.434,
  avgR: 0.176,
  /** Standard deviation of a single trade's result, in R. */
  sdR: 1.41,
  tradesPerMonth: 6.3,
  maxDrawdownR: 13.8,
  longestLosingStreak: 11,
} as const;

/** Trades needed before a live average says much; below this the band is too wide to judge. */
export const MIN_TRADES_TO_JUDGE = 30;

export interface ExpectedPoint {
  n: number;
  expected: number;
  low: number;
  high: number;
}

const BAND_SIGMAS = 2;

/** Expected cumulative R after each trade, with the range about 95% of backtest-like runs stay inside. */
export function expectedPath(tradeCount: number): ExpectedPoint[] {
  return Array.from({ length: tradeCount + 1 }, (_, n) => {
    const expected = BACKTEST.avgR * n;
    const spread = BAND_SIGMAS * BACKTEST.sdR * Math.sqrt(n);
    return { n, expected, low: expected - spread, high: expected + spread };
  });
}

export type Verdict = "too-early" | "in-range" | "below-range" | "above-range";

export function verdict(liveTotalR: number, tradeCount: number): Verdict {
  if (tradeCount < MIN_TRADES_TO_JUDGE) return "too-early";
  const point = expectedPath(tradeCount)[tradeCount];
  if (liveTotalR < point.low) return "below-range";
  if (liveTotalR > point.high) return "above-range";
  return "in-range";
}
