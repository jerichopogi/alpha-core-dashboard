"use client";

import { useMemo, useState } from "react";
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

const MARGIN = { top: 12, right: 16, bottom: 22, left: 64 };
const MAIN_HEIGHT = 230;
const DD_HEIGHT = 96;
const EQUITY_MATCH_SECONDS = 30 * 60;
const MIN_DD_DOMAIN = 0.01;
const PH_OFFSET = 8 * 3600;
const TICK_STEPS_DAYS = [1, 2, 7, 14, 30, 61, 91, 182, 365];

/** Ticks on Philippine midnights, spaced so about `target` of them fit. */
function dayTicks(start: number, end: number, target: number): number[] {
  const stepDays = TICK_STEPS_DAYS.find((d) => d >= (end - start) / DAY / target) ?? 365;
  const step = stepDays * DAY;
  const first = Math.ceil((start + PH_OFFSET) / DAY) * DAY - PH_OFFSET;
  const ticks: number[] = [];
  for (let t = first; t < end; t += step) ticks.push(t);
  return ticks;
}

const shortDate = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });

/** Value in effect at time t: the last point at or before it. */
function valueAt(points: SeriesPoint[], t: number): number | null {
  let found: number | null = null;
  for (const p of points) {
    if (p.t > t) break;
    found = p.v;
  }
  return found;
}

/** Points inside [start, end], starting with the value already in effect at `start`. */
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

/** Balance from every deal, recorded equity, and the drawdown below them on its own scale. */
export function EquityChart({ data }: { data: EquityChartData }) {
  const [range, setRange] = useState<RangeKey>("all");
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>(900);

  // Geometry depends only on the data, range and width, not on where the pointer is.
  const geometry = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    const start = Math.max(data.firstTime, days ? data.now - days * DAY : data.firstTime);
    const end = Math.max(data.now, start + 3600);
    const balance = [...clip(data.balance, start), { t: end, v: valueAt(data.balance, end) ?? 0 }];
    const equity = data.equity.filter((p) => p.t >= start);
    const drawdown = [...clip(data.drawdown, start), { t: end, v: valueAt(data.drawdown, end) ?? 0 }];

    const values = [...balance, ...equity].map((p) => p.v);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo || Math.abs(hi) * 0.05 || 1) * 0.12;
    const x = linearScale([start, end], [MARGIN.left, width - MARGIN.right]);
    const y = linearScale([lo - pad, hi + pad], [MAIN_HEIGHT - MARGIN.bottom, MARGIN.top]);
    const ddMax = Math.max(MIN_DD_DOMAIN, ...drawdown.map((p) => p.v)) * 1.15;
    const yd = linearScale([0, ddMax], [6, DD_HEIGHT - MARGIN.bottom]);

    const toXY = (scale: Scale) => (p: SeriesPoint): [number, number] => [x(p.t), scale(p.v)];
    const ddPath = stepPath(drawdown.map(toXY(yd)));
    const ddArea = `${ddPath} V${yd(0).toFixed(1)} H${x(drawdown[0]?.t ?? start).toFixed(1)} Z`;
    const xTicks = dayTicks(start, end, Math.max(2, Math.floor(width / 110))).filter((t) => x(t) > MARGIN.left + 24 && x(t) < width - MARGIN.right - 24);
    const balancePath = stepPath(balance.map(toXY(y)));
    const equityPath = equity.length > 1 ? linePath(equity.map(toXY(y))) : null;
    return { start, end, balance, equity, drawdown, x, y, yd, ddMax, ddPath, ddArea, xTicks, balancePath, equityPath };
  }, [data, range, width]);
  const { start, end, balance, equity, drawdown, x, y, yd, ddMax, ddPath, ddArea, xTicks, balancePath, equityPath } = geometry;

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = MARGIN.left + ((event.clientX - box.left) / box.width) * (width - MARGIN.left - MARGIN.right);
    setHoverT(start + ((px - MARGIN.left) / (width - MARGIN.left - MARGIN.right)) * (end - start));
  };
  const hover = hoverT === null ? null : {
    t: hoverT,
    balance: valueAt(balance, hoverT),
    equity: nearest(equity, hoverT),
    drawdown: valueAt(drawdown, hoverT),
  };
  const hitbox = (height: number, top: number) => (
    <rect x={MARGIN.left} y={top} width={width - MARGIN.left - MARGIN.right} height={height} fill="transparent"
      onPointerMove={onMove} onPointerLeave={() => setHoverT(null)} />
  );
  const lastBalance = balance[balance.length - 1]?.v ?? 0;
  const lastEquity = equity[equity.length - 1]?.v;

  return (
    <div className="equity">
      <div className="chart-toolbar">
        <div className="legend" aria-hidden="true">
          <span><i className="swatch swatch-line swatch-balance" />Balance {formatMoney(lastBalance)}</span>
          {lastEquity !== undefined && <span><i className="swatch swatch-line swatch-equity" />Equity {formatMoney(lastEquity)}</span>}
          <span><i className="swatch swatch-dd" />Drawdown</span>
        </div>
        <div className="tabs" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={range === r.key} className="tab" onClick={() => setRange(r.key)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div ref={ref} className="chart-fluid">
        <svg width={width} height={MAIN_HEIGHT} role="img" aria-label={`Balance over time, now ${formatMoney(lastBalance)}`}>
          {niceTicks(y.domain[0], y.domain[1], 4).map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className="grid" />
              <text x={MARGIN.left - 8} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{formatWholeMoney(tick)}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={MAIN_HEIGHT - 6} className="tick" textAnchor="middle">{shortDate.format(new Date(t * 1000))}</text>
          ))}
          <path d={balancePath} className="line line-balance" />
          {equityPath && <path d={equityPath} className="line line-equity" />}
          {hover && <line x1={x(hover.t)} x2={x(hover.t)} y1={MARGIN.top} y2={MAIN_HEIGHT - MARGIN.bottom} className="crosshair" />}
          {hover?.balance != null && <circle cx={x(hover.t)} cy={y(hover.balance)} r={4} className="dot dot-balance" />}
          {hover?.equity && <circle cx={x(hover.equity.t)} cy={y(hover.equity.v)} r={4} className="dot dot-equity" />}
          {hitbox(MAIN_HEIGHT - MARGIN.top - MARGIN.bottom, MARGIN.top)}
        </svg>

        <svg width={width} height={DD_HEIGHT} role="img" aria-label={`Drawdown below the best result, now ${formatPercent(lastOf(drawdown))}`}>
          {[0, ddMax / 1.15].map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yd(tick)} y2={yd(tick)} className={tick === 0 ? "axis-zero" : "grid"} />
              <text x={MARGIN.left - 8} y={yd(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{tick === 0 ? "0%" : `−${formatPercent(tick, 0)}`}</text>
            </g>
          ))}
          <path d={ddArea} className="dd-area" />
          <path d={ddPath} className="line dd-line" />
          {hover && <line x1={x(hover.t)} x2={x(hover.t)} y1={6} y2={DD_HEIGHT - MARGIN.bottom} className="crosshair" />}
          {hitbox(DD_HEIGHT - MARGIN.bottom - 6, 6)}
        </svg>

        {hover && (
          <div className="tooltip" style={{ left: Math.min(x(hover.t), width - 190), top: 24 }}>
            <strong>{formatDateTime(hover.t)}</strong>
            {hover.balance != null && <span>Balance {formatMoney(hover.balance)}</span>}
            {hover.equity && <span>Equity {formatMoney(hover.equity.v)}</span>}
            {hover.drawdown != null && <span>Below peak {formatPercent(hover.drawdown)}</span>}
          </div>
        )}
      </div>
      {data.equity.length < 3 && <p className="footnote">Equity is recorded from now on, one point every 15 minutes; the balance line covers the full history.</p>}
    </div>
  );
}

const lastOf = (points: SeriesPoint[]) => points[points.length - 1]?.v ?? 0;
