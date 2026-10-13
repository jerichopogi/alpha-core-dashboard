import type { Snapshot } from "./types";

/** The EA reports every five minutes; two missed reports in a row counts as silent. */
export const STALE_AFTER_SECONDS = 12 * 60;

const isLiveEa = (snapshot: Snapshot, nowSeconds: number): boolean =>
  snapshot.source === "ea" && snapshot.ea.algo_enabled && nowSeconds - snapshot.receivedAt <= STALE_AFTER_SECONDS;

/**
 * Whether an incoming report should leave the stored snapshot untouched.
 *
 * Two kinds of sender know less than the live EA and must not overwrite its status:
 * a backfill from another terminal, and a second copy of the EA whose trading is
 * switched off (the copy left on the PC after migrating to the VPS keeps running
 * and reporting). Their deals and signals are still stored.
 */
export function keepsCurrentSnapshot(current: Snapshot | null, incoming: Snapshot, nowSeconds: number): boolean {
  if (!current) return false;
  if (incoming.source === "backfill") return current.source === "ea";
  return !incoming.ea.algo_enabled && isLiveEa(current, nowSeconds);
}
