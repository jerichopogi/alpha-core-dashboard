/**
 * What each setup's backtest produced, on XAUUSD from 2021-01 to 2026-10 with
 * costs of 0.35 per ounce and the broker clock corrected to New York + 7.
 * Both were picked from many tested settings, so expect the live edge to be smaller.
 */
export interface Backtest {
  /** Plain description shown under the comparison. */
  description: string;
  trades: number;
  winRate: number;
  avgR: number;
  /** Standard deviation of a single trade's result, in R. */
  sdR: number;
  tradesPerMonth: number;
  maxDrawdownR: number;
  longestLosingStreak: number;
}

/** Keyed by the setup's signal timeframe as the EA reports it. */
export const BACKTESTS: Record<string, Backtest> = {
  M15: {
    description:
      "15m: EMA 10/36, volatility filter 1.2, stop 2 x ATR, target 1:2, no entries 11:00 to 16:00 New York. 429 trades.",
    trades: 429,
    winRate: 0.443,
    avgR: 0.195,
    sdR: 1.41,
    tradesPerMonth: 6.2,
    maxDrawdownR: 13.8,
    longestLosingStreak: 11,
  },
  M3: {
    description:
      "3m: EMA 13/34, volatility filter 1.2, stop 6 x ATR, target 1:2, with the 1h trend, entries 08:00 to 11:00 New York. 661 trades.",
    trades: 661,
    winRate: 0.424,
    avgR: 0.175,
    sdR: 1.37,
    tradesPerMonth: 9.5,
    maxDrawdownR: 12.7,
    longestLosingStreak: 10,
  },
};

export const backtestFor = (timeframe: string): Backtest | null => BACKTESTS[timeframe] ?? null;

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
export function expectedPath(tradeCount: number, backtest: Backtest): ExpectedPoint[] {
  return Array.from({ length: tradeCount + 1 }, (_, n) => {
    const expected = backtest.avgR * n;
    const spread = BAND_SIGMAS * backtest.sdR * Math.sqrt(n);
    return { n, expected, low: expected - spread, high: expected + spread };
  });
}

export type Verdict = "too-early" | "in-range" | "below-range" | "above-range";

export function verdict(liveTotalR: number, tradeCount: number, backtest: Backtest): Verdict {
  if (tradeCount < MIN_TRADES_TO_JUDGE) return "too-early";
  const point = expectedPath(tradeCount, backtest)[tradeCount];
  if (liveTotalR < point.low) return "below-range";
  if (liveTotalR > point.high) return "above-range";
  return "in-range";
}
