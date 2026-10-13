"use client";

import { useState } from "react";
import { formatSignedMoney, formatWholeMoney } from "@/lib/format";
import { linearScale, niceTicks, paddedDomain, stepPath } from "./chart-utils";

export interface PnlPoint {
  time: number;
  label: string;
  source: "ea" | "manual";
  profit: number;
  ea: number;
  manual: number;
}

interface PnlChartProps {
  points: PnlPoint[];
  startTime: number;
  endTime: number;
  startLabel: string;
  endLabel: string;
}

const WIDTH = 1100;
const HEIGHT = 300;
const MARGIN = { top: 16, right: 150, bottom: 28, left: 60 };
const SERIES = [
  { key: "ea", name: "EA", className: "ea" },
  { key: "manual", name: "Manual", className: "manual" },
] as const;

/** Cumulative profit of EA trades and manual trades, each on its own line, over time. */
export function PnlChart({ points, startTime, endTime, startLabel, endLabel }: PnlChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const x = linearScale([startTime, Math.max(endTime, startTime + 1)], [MARGIN.left, WIDTH - MARGIN.right]);
  const y = linearScale(paddedDomain(points.flatMap((p) => [p.ea, p.manual])), [HEIGHT - MARGIN.bottom, MARGIN.top]);
  const last = points[points.length - 1];
  const point = active === null ? null : points[active];

  const pathFor = (key: "ea" | "manual") =>
    stepPath([[x(startTime), y(0)], ...points.map((p): [number, number] => [x(p.time), y(p[key])]), [x(endTime), y(last ? last[key] : 0)]]);

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    if (points.length === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const px = MARGIN.left + ((event.clientX - box.left) / box.width) * (WIDTH - MARGIN.left - MARGIN.right);
    const distances = points.map((p) => Math.abs(x(p.time) - px));
    setActive(distances.indexOf(Math.min(...distances)));
  };

  // Keep the two end labels from overlapping when the lines finish close together.
  const endY = { ea: y(last?.ea ?? 0), manual: y(last?.manual ?? 0) };
  if (Math.abs(endY.ea - endY.manual) < 14) {
    const mid = (endY.ea + endY.manual) / 2;
    const eaOnTop = endY.ea <= endY.manual;
    endY.ea = mid + (eaOnTop ? -7 : 7);
    endY.manual = mid + (eaOnTop ? 7 : -7);
  }

  return (
    <figure className="chart">
      <div className="legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key}><i className="swatch swatch-line" style={{ background: `var(--series-${s.className})` }} />{s.name}</span>
        ))}
      </div>
      <div className="chart-scroll">
      <div className="chart-frame">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Cumulative profit of EA trades and manual trades over time">
          {niceTicks(y.domain[0], y.domain[1], 4).map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "axis-zero" : "grid"} />
              <text x={MARGIN.left - 8} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{formatWholeMoney(tick)}</text>
            </g>
          ))}
          <text x={MARGIN.left} y={HEIGHT - 6} className="tick">{startLabel}</text>
          <text x={WIDTH - MARGIN.right} y={HEIGHT - 6} className="tick" textAnchor="end">{endLabel}</text>

          {SERIES.map((s) => (
            <g key={s.key}>
              <path d={pathFor(s.key)} className={`line line-${s.className}`} />
              <text x={WIDTH - MARGIN.right + 8} y={endY[s.key]} className="direct-label direct-label-strong" dominantBaseline="middle">
                {s.name} {formatSignedMoney(last ? last[s.key] : 0)}
              </text>
            </g>
          ))}
          {point && (
            <>
              <line x1={x(point.time)} x2={x(point.time)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} className="crosshair" />
              <circle cx={x(point.time)} cy={y(point[point.source])} r={5} className={`dot dot-${point.source}`} />
            </>
          )}
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
          <div className="tooltip" style={{ left: `${(x(point.time) / WIDTH) * 100}%`, top: `${(y(point[point.source]) / HEIGHT) * 100}%` }}>
            <strong>{point.label}</strong>
            <span>{point.source === "ea" ? "EA" : "Manual"} trade {formatSignedMoney(point.profit)}</span>
            <span>EA total {formatSignedMoney(point.ea)}</span>
            <span>Manual total {formatSignedMoney(point.manual)}</span>
          </div>
        )}
        {points.length === 0 && <p className="chart-empty">No closed trades yet.</p>}
      </div>
      </div>
    </figure>
  );
}
