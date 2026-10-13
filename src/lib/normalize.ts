import type { Deal, EaState, Position, Report, Signal, Snapshot } from "./types";

const HALF_HOUR = 1800;

/** Broker server offset from UTC in seconds, snapped to the nearest half hour. */
export function serverOffset(time: Report["time"]): number {
  return Math.round((time.server - time.gmt) / HALF_HOUR) * HALF_HOUR;
}

/**
 * MT5 stamps everything in broker server time. Convert a report to UTC so the
 * dashboard never has to know which broker it came from.
 */
export function normalizeReport(report: Report, receivedAt: number) {
  const offset = serverOffset(report.time);
  const toUtc = (t: number) => Math.max(0, t - offset);

  const positions: Position[] = report.positions.map((p) => ({ ...p, time: toUtc(p.time) }));
  const deals: Deal[] = report.deals.map((d) => ({ ...d, time: toUtc(d.time) }));
  const signals: Signal[] = report.signals.map((s) => ({ ...s, time: toUtc(s.time), magic: s.magic ?? report.ea.magic }));
  const snapshot: Snapshot = { account: report.account, ea: report.ea, positions, source: report.source, receivedAt };
  const ea: EaState = { ...report.ea, source: report.source, receivedAt };

  return { snapshot, ea, deals, signals };
}

export const signalKey = (s: Signal) => `${s.magic}:${s.time}:${s.dir}`;
