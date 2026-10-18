"use client";

import { useId, useMemo, useState } from "react";
import { formatDateTime, formatMoney, formatPercent, formatWholeMoney } from "@/lib/format";
import type { EquityChartData, SeriesPoint } from "@/lib/insights";
import { linePath, linearScale, niceTicks, stepPath, type Scale } from "./chart-utils";
import { useWidth } from "./useWidth";

const DAY = 86400;
const RANGES = [
  { key: "all", label: "All", days: null },
  { key: "90", label: "90d", days: 90 },
  { key: "30", label: "30d", days: 30 },
  { key: "7", label: "7d", days: 7 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const MARGIN = { top: 12, right: 12, bottom: 26, left: 60 };
const HEIGHT = { equity: 360, drawdown: 240 } as const;
const COMPACT_WIDTH = 600;
const COMPACT_HEIGHT = 230;
const EQUITY_MATCH_SECONDS = 30 * 60;
const MIN_DD_DOMAIN = 0.01;
const PH_OFFSET = 8 * 3600;
const TICK_STEPS_DAYS = [1, 2, 7, 14, 30, 61, 91, 182, 365];
const shortDate = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });

/** Ticks on Philippine midnights, spaced so about `target` of them fit. */
function dayTicks(start: number, end: number, target: number): number[] {
  const stepDays = TICK_STEPS_DAYS.find((d) => d >= (end - start) / DAY / target) ?? 365;
  const first = Math.ceil((start + PH_OFFSET) / DAY) * DAY - PH_OFFSET;
  const ticks: number[] = [];
  for (let t = first; t < end; t += stepDays * DAY) ticks.push(t);
  return ticks;
}

/** Value in effect at time t: the last point at or before it. */
function valueAt(points: SeriesPoint[], t: number): number | null {
  let found: number | null = null;
  for (const p of points) {
    if (p.t > t) break;
    found = p.v;
  }
  return found;
}

/** Points from `start`, beginning with the value already in effect then. */
function clip(points: SeriesPoint[], start: number): SeriesPoint[] {
  const before = valueAt(points, start);
  const inside = points.filter((p) => p.t >= start);
  return before === null ? inside : [{ t: start, v: before }, ...inside];
}

function nearest(points: SeriesPoint[], t: number): SeriesPoint | null {
  let best: SeriesPoint | null = null;
  for (const p of points) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  return best && Math.abs(best.t - t) <= EQUITY_MATCH_SECONDS ? best : null;
}

interface EquityChartProps {
  data: EquityChartData;
  /** "equity": balance area with the recorded equity line. "drawdown": how far below the peak. */
  mode?: "equity" | "drawdown";
}

export function EquityChart({ data, mode = "equity" }: EquityChartProps) {
  const [range, setRange] = useState<RangeKey>("all");
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>(900);
  // React ids can hold characters that break url(#…); keep only safe ones.
  const gradientId = `area-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const height = width < COMPACT_WIDTH ? COMPACT_HEIGHT : HEIGHT[mode];

  // Geometry depends only on the data, range, mode and width, not on where the pointer is.
  const g = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    const start = Math.max(data.firstTime, days ? data.now - days * DAY : data.firstTime);
    const end = Math.max(data.now, start + 3600);
    const close = (points: SeriesPoint[]) => [...clip(points, start), { t: end, v: valueAt(points, end) ?? 0 }];
    const balance = close(data.balance);
    const equity = data.equity.filter((p) => p.t >= start);
    const drawdown = close(data.drawdown);
    const x = linearScale([start, end], [MARGIN.left, width - MARGIN.right]);
    const bottom = height - MARGIN.bottom;

    let y: Scale;
    if (mode === "equity") {
      const values = [...balance, ...equity].map((p) => p.v);
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      const pad = (hi - lo || Math.abs(hi) * 0.05 || 1) * 0.12;
      y = linearScale([Math.max(0, lo - pad), hi + pad], [bottom, MARGIN.top]);
    } else {
      y = linearScale([Math.max(MIN_DD_DOMAIN, ...drawdown.map((p) => p.v)) * 1.12, 0], [bottom, MARGIN.top]);
    }
    const xy = (p: SeriesPoint): [number, number] => [x(p.t), y(p.v)];
    const main = mode === "equity" ? balance : drawdown;
    const mainPath = stepPath(main.map(xy));
    const firstX = x(main[0]?.t ?? start).toFixed(1);
    const area = mode === "equity" ? `${mainPath} V${bottom} H${firstX} Z` : `${mainPath} V${y(0).toFixed(1)} H${firstX} Z`;
    const equityPath = mode === "equity" && equity.length > 1 ? linePath(equity.map(xy)) : null;
    const yTicks = mode === "equity" ? niceTicks(y.domain[0], y.domain[1], 4) : niceTicks(0, y.domain[0], 4);
    const xTicks = dayTicks(start, end, Math.max(2, Math.floor(width / 120))).filter((t) => x(t) > MARGIN.left + 24 && x(t) < width - MARGIN.right - 24);
    return { start, end, balance, equity, drawdown, x, y, mainPath, area, equityPath, yTicks, xTicks };
  }, [data, range, width, mode, height]);

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setHoverT(g.start + ((event.clientX - box.left) / box.width) * (g.end - g.start));
  };
  const hover = hoverT === null ? null : {
    t: hoverT,
    balance: valueAt(g.balance, hoverT),
    equity: nearest(g.equity, hoverT),
    drawdown: valueAt(g.drawdown, hoverT),
  };
  const hoverY = hover ? (mode === "equity" ? hover.balance : hover.drawdown) : null;
  const lastBalance = g.balance[g.balance.length - 1]?.v ?? 0;
  const lastEquity = g.equity[g.equity.length - 1]?.v;
  const lastDrawdown = g.drawdown[g.drawdown.length - 1]?.v ?? 0;

  return (
    <div>
      <div className="chart-toolbar">
        <div className="legend">
          {mode === "equity" ? (
            <>
              <span><i className="swatch swatch-line swatch-balance" aria-hidden="true" />Balance <strong>{formatMoney(lastBalance)}</strong></span>
              {lastEquity !== undefined && <span><i className="swatch swatch-line swatch-equity" aria-hidden="true" />Equity <strong>{formatMoney(lastEquity)}</strong></span>}
            </>
          ) : (
            <span><i className="swatch swatch-dd" aria-hidden="true" />Below peak now <strong>{formatPercent(lastDrawdown)}</strong></span>
          )}
        </div>
        <div className="tabs" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={range === r.key} className="tab" onClick={() => setRange(r.key)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div ref={ref} className="chart-fluid">
        <svg width={width} height={height} role="img"
          aria-label={mode === "equity" ? `Balance over time, now ${formatMoney(lastBalance)}` : `Drawdown below the peak, now ${formatPercent(lastDrawdown)}`}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="area-stop-top" />
              <stop offset="100%" className="area-stop-bottom" />
            </linearGradient>
          </defs>
          {g.yTicks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={g.y(tick)} y2={g.y(tick)} className={tick === 0 && mode === "drawdown" ? "axis-zero" : "grid"} />
              <text x={MARGIN.left - 10} y={g.y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">
                {mode === "equity" ? formatWholeMoney(tick) : tick === 0 ? "0%" : `−${formatPercent(tick, 0)}`}
              </text>
            </g>
          ))}
          {g.xTicks.map((t) => (
            <text key={t} x={g.x(t)} y={height - 6} className="tick" textAnchor="middle">{shortDate.format(new Date(t * 1000))}</text>
          ))}
          {mode === "equity" ? (
            <>
              <path d={g.area} fill={`url(#${gradientId})`} />
              <path d={g.mainPath} className="line line-balance" />
              {g.equityPath && <path d={g.equityPath} className="line line-equity" />}
            </>
          ) : (
            <>
              <path d={g.area} className="dd-area" />
              <path d={g.mainPath} className="line dd-line" />
            </>
          )}
          {hover && <line x1={g.x(hover.t)} x2={g.x(hover.t)} y1={MARGIN.top} y2={height - MARGIN.bottom} className="crosshair" />}
          {hover && hoverY !== null && <circle cx={g.x(hover.t)} cy={g.y(hoverY)} r={5} className={`dot ${mode === "equity" ? "dot-balance" : "dd-dot"}`} />}
          {hover?.equity && mode === "equity" && <circle cx={g.x(hover.equity.t)} cy={g.y(hover.equity.v)} r={4} className="dot dot-equity" />}
          <rect x={MARGIN.left} y={MARGIN.top} width={Math.max(0, width - MARGIN.left - MARGIN.right)} height={height - MARGIN.top - MARGIN.bottom}
            fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHoverT(null)} />
        </svg>
        {hover && (
          <div className="tooltip" style={{ left: Math.min(g.x(hover.t), width - 200), top: 16 }}>
            <strong>{formatDateTime(hover.t)}</strong>
            {hover.balance != null && <span>Balance {formatMoney(hover.balance)}</span>}
            {hover.equity && <span>Equity {formatMoney(hover.equity.v)}</span>}
            {hover.drawdown != null && <span>Below peak {formatPercent(hover.drawdown)}</span>}
          </div>
        )}
      </div>
      {mode === "equity" && data.equity.length < 3 && (
        <p className="footnote">Equity is recorded every 15 minutes from the latest update on; the balance line covers the full history.</p>
      )}
    </div>
  );
}
