"use client";

import { useState } from "react";
import type { ExpectedPoint } from "@/lib/benchmark";
import { formatR } from "@/lib/format";
import { linePath, linearScale, niceTicks } from "./chart-utils";

export interface EdgePoint {
  n: number;
  r: number;
  cumulative: number;
  label: string;
}

interface EdgeChartProps {
  live: EdgePoint[];
  expected: ExpectedPoint[];
  /** Palette slot of the setup being shown. */
  color: number;
}

const WIDTH = 720;
const HEIGHT = 300;
const MARGIN = { top: 16, right: 76, bottom: 34, left: 44 };

/** Live cumulative R against the path the backtest expects, by trade number. */
export function EdgeChart({ live, expected, color }: EdgeChartProps) {
  const seriesColor = `var(--series-${color})`;
  const [active, setActive] = useState<number | null>(null);
  const last = expected[expected.length - 1];
  const values = [last.low, last.high, ...expected.map((p) => p.low), ...live.map((p) => p.cumulative)];
  const x = linearScale([0, last.n], [MARGIN.left, WIDTH - MARGIN.right]);
  const y = linearScale([Math.min(...values) - 1, Math.max(...values) + 1], [HEIGHT - MARGIN.bottom, MARGIN.top]);

  const band = `${linePath(expected.map((p) => [x(p.n), y(p.high)]))} ${linePath(
    [...expected].reverse().map((p) => [x(p.n), y(p.low)]),
  ).replace("M", "L")} Z`;
  const liveLine: Array<[number, number]> = [[x(0), y(0)], ...live.map((p): [number, number] => [x(p.n), y(p.cumulative)])];
  const point = active === null ? null : live[active];
  const tail = live[live.length - 1];

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    if (live.length === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const n = ((event.clientX - box.left) / box.width) * last.n;
    const nearest = Math.min(live.length, Math.max(1, Math.round(n)));
    setActive(nearest - 1);
  };

  return (
    <figure className="chart">
      <div className="legend" aria-hidden="true">
        <span><i className="swatch swatch-line" style={{ background: seriesColor }} />Live</span>
        <span><i className="swatch swatch-line" style={{ background: "var(--ink-3)" }} />Backtest average</span>
        <span><i className="swatch swatch-band" />Range for about 95% of backtest-like runs</span>
      </div>
      <div className="chart-scroll">
      <div className="chart-frame">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Live cumulative R compared with the backtest's expected range, by trade number">
          {niceTicks(y.domain[0], y.domain[1]).map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "axis-zero" : "grid"} />
              <text x={MARGIN.left - 8} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{tick}R</text>
            </g>
          ))}
          {niceTicks(0, last.n, 6).map((tick) => (
            <text key={tick} x={x(tick)} y={HEIGHT - MARGIN.bottom + 16} className="tick" textAnchor="middle">{tick}</text>
          ))}
          <text x={(MARGIN.left + WIDTH - MARGIN.right) / 2} y={HEIGHT - 2} className="axis-title" textAnchor="middle">Trades closed by this setup</text>

          <path d={band} className="band" />
          <path d={linePath(expected.map((p) => [x(p.n), y(p.expected)]))} className="line line-reference" />
          <text x={x(last.n) + 6} y={y(last.expected)} className="direct-label" dominantBaseline="middle">{formatR(last.expected, 1)}</text>

          {live.length > 0 && <path d={linePath(liveLine)} className="line" style={{ stroke: seriesColor }} />}
          {live.map((p, i) => (
            <circle key={p.n} cx={x(p.n)} cy={y(p.cumulative)} r={active === i ? 5 : 3.5} className="dot" style={{ fill: seriesColor }} />
          ))}
          {tail && active === null && (
            <text x={x(tail.n) + 8} y={y(tail.cumulative)} className="direct-label direct-label-strong" dominantBaseline="middle">{formatR(tail.cumulative, 1)}</text>
          )}
          {point && <line x1={x(point.n)} x2={x(point.n)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} className="crosshair" />}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={WIDTH - MARGIN.left - MARGIN.right}
            height={HEIGHT - MARGIN.top - MARGIN.bottom}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {point && (
          <div className="tooltip" style={{ left: `${(x(point.n) / WIDTH) * 100}%`, top: `${(y(point.cumulative) / HEIGHT) * 100}%` }}>
            <strong>Trade {point.n}</strong>
            <span>{point.label}</span>
            <span>Result {formatR(point.r)}</span>
            <span>Live total {formatR(point.cumulative)}</span>
            <span>Backtest average {formatR(expected[point.n]?.expected ?? null)}</span>
          </div>
        )}
        {live.length === 0 && <p className="chart-empty">No EA trades have closed yet. The line starts with the first one.</p>}
      </div>
      </div>
    </figure>
  );
}
