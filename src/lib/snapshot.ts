import type { EaState, Snapshot } from "./types";

/** The EA reports every five minutes; two missed reports in a row counts as silent. */
export const STALE_AFTER_SECONDS = 12 * 60;

type Reported = { source: Snapshot["source"]; receivedAt: number };

const isFresh = (state: Reported, nowSeconds: number): boolean => nowSeconds - state.receivedAt <= STALE_AFTER_SECONDS;

const isLive = (state: Reported, algoEnabled: boolean, nowSeconds: number): boolean =>
  state.source === "ea" && algoEnabled && isFresh(state, nowSeconds);

/**
 * Whether an incoming report should leave the stored account snapshot untouched.
 *
 * Two kinds of sender know less than a live EA and must not overwrite what it sent:
 * a backfill from another terminal, and a copy of the EA whose trading is switched
 * off (the copy left on the PC after migrating to the VPS keeps running and
 * reporting). Their deals and signals are still stored.
 */
export function keepsCurrentSnapshot(current: Snapshot | null, incoming: Snapshot, nowSeconds: number): boolean {
  if (!current) return false;
  if (incoming.source === "backfill") return current.source === "ea";
  return !incoming.ea.algo_enabled && isLive(current, current.ea.algo_enabled, nowSeconds);
}

/**
 * Whether an incoming report should leave one setup's stored state untouched.
 * A backfill never describes a setup. A trading-off copy does not replace the
 * live copy of the same setup while that one is still reporting.
 */
export function keepsCurrentEa(current: EaState | null, incoming: EaState, nowSeconds: number): boolean {
  if (incoming.source === "backfill") return true;
  if (!current) return false;
  return !incoming.algo_enabled && isLive(current, current.algo_enabled, nowSeconds);
}
