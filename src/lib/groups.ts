import { MANUAL } from "./trades";
import type { EaState } from "./types";

/**
 * Who opened a trade: one of the EA's setups, or you by hand. Each group keeps
 * the same colour everywhere on the page.
 */
export interface Group {
  /** A setup's magic number as text, or "manual". */
  key: string;
  label: string;
  /** Slot in the chart palette (--series-N). Fixed per group, never reassigned. */
  color: number;
}

const MANUAL_COLOR = 2;
// Setups take the remaining palette slots in the order their magic numbers sort.
const SETUP_COLORS = [1, 3, 4, 5, 6];

export const MANUAL_GROUP: Group = { key: MANUAL, label: "Manual", color: MANUAL_COLOR };

/**
 * Magic numbers of setups switched off for good. They leave the page: no card, trades or
 * signals. Their trades are not counted as manual. Remove a number to bring its setup back.
 */
export const RETIRED_SETUPS: readonly number[] = [
  20261014, // AC 3m, disabled 2026-10-16
];

function setupLabel(ea: EaState, all: EaState[]): string {
  const sameName = all.filter((other) => other.name === ea.name).length > 1;
  return sameName ? `${ea.name} ${ea.timeframe}` : ea.name;
}

/** Setup groups in magic-number order, then manual. */
export function buildGroups(eas: EaState[]): Group[] {
  const setups = eas.map((ea, index) => ({
    key: String(ea.magic),
    label: setupLabel(ea, eas),
    color: SETUP_COLORS[index % SETUP_COLORS.length],
  }));
  return [...setups, MANUAL_GROUP];
}
