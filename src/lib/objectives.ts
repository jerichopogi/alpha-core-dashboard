import type { BalancePoint } from "./analytics";
import { formatPercent, formatSignedMoney } from "./format";

/** Your own limits, prop-firm style. Change them here. */
export const MONTHLY_TARGET = 0.1;
export const MAX_DRAWDOWN_LIMIT = 0.2;
export const DAILY_LOSS_CAP = 2;
const WARN_AT = 0.75;

const PH_OFFSET = 8 * 3600;
const DAY = 86400;

export type ObjectiveState = "passed" | "on-track" | "behind" | "ok" | "warning" | "breached" | "paused" | "neutral";

export interface Objective {
  key: string;
  title: string;
  value: string;
  target: string;
  /** 0 to 1, for the progress bar. */
  progress: number;
  state: ObjectiveState;
  detail: string;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Midnight on the 1st of the current month, Philippine time, as epoch seconds. */
export function monthStart(nowSeconds: number): number {
  const ph = new Date((nowSeconds + PH_OFFSET) * 1000);
  return Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), 1) / 1000 - PH_OFFSET;
}

function daysLeftInMonth(nowSeconds: number): number {
  const ph = new Date((nowSeconds + PH_OFFSET) * 1000);
  const next = Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth() + 1, 1) / 1000 - PH_OFFSET;
  return Math.max(0, Math.ceil((next - nowSeconds) / DAY));
}

/**
 * This month's closed-trade result against the target, measured on the capital at work:
 * the balance when the month began plus anything deposited (minus withdrawn) since.
 */
export function monthlyTargetObjective(points: BalancePoint[], nowSeconds: number): Objective {
  const start = monthStart(nowSeconds);
  const before = [...points].reverse().find((p) => p.time < start) ?? points[0] ?? { time: start, balance: 0, result: 0 };
  const last = points[points.length - 1] ?? before;
  const result = last.result - before.result;
  const paidIn = last.balance - last.result - (before.balance - before.result);
  const capital = before.balance + paidIn;
  const title = "Monthly profit target";
  const days = daysLeftInMonth(nowSeconds);

  if (capital <= 0) {
    return { key: "month", title, value: formatSignedMoney(result), target: `+${formatPercent(MONTHLY_TARGET, 0)}`, progress: 0, state: "neutral", detail: "No capital in the account this month" };
  }
  const goal = capital * MONTHLY_TARGET;
  return {
    key: "month",
    title,
    value: formatSignedMoney(result),
    target: formatSignedMoney(goal),
    progress: clamp01(result / goal),
    state: result >= goal ? "passed" : result < 0 ? "behind" : "on-track",
    detail: `${formatPercent(result / capital)} of +${formatPercent(MONTHLY_TARGET, 0)} · ${days} ${days === 1 ? "day" : "days"} left`,
  };
}

/** How far below the peak the account is, against the hard limit. */
export function drawdownObjective(currentPct: number, worstThisRunPct: number): Objective {
  const used = currentPct / MAX_DRAWDOWN_LIMIT;
  return {
    key: "drawdown",
    title: "Max drawdown",
    value: formatPercent(currentPct),
    target: formatPercent(MAX_DRAWDOWN_LIMIT, 0),
    progress: clamp01(used),
    state: used >= 1 ? "breached" : used >= WARN_AT ? "warning" : "ok",
    detail: `Worst since the last refill ${formatPercent(worstThisRunPct)}`,
  };
}

/** The EA's own rule: it stops for the day after this many losses. */
export function lossCapObjective(lossesToday: number): Objective {
  return {
    key: "loss-cap",
    title: "EA daily loss cap",
    value: `${lossesToday} of ${DAILY_LOSS_CAP}`,
    target: `${DAILY_LOSS_CAP} losses`,
    progress: clamp01(lossesToday / DAILY_LOSS_CAP),
    state: lossesToday >= DAILY_LOSS_CAP ? "paused" : lossesToday > 0 ? "warning" : "ok",
    detail: lossesToday >= DAILY_LOSS_CAP ? "Cap reached: no more EA trades today" : `Stops for the day after ${DAILY_LOSS_CAP} losses`,
  };
}
