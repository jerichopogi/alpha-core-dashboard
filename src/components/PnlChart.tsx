"use client";

import { useState } from "react";
import { formatSignedMoney, formatWholeMoney } from "@/lib/format";
import type { Group } from "@/lib/groups";
import { linearScale, niceTicks, paddedDomain, stepPath } from "./chart-utils";

export interface PnlPoint {
  time: number;
  label: string;
  /** Key of the group whose trade closed at this point. */
  source: string;
  profit: number;
  /** Running total per group after this trade. */
  totals: Record<string, number>;
}

interface PnlChartProps {
  series: Group[];
  points: PnlPoint[];
  startTime: number;
  endTime: number;
  startLabel: string;
  endLabel: string;
}

const WIDTH = 1100;
const HEIGHT = 300;
const MARGIN = { top: 16, right: 170, bottom: 28, left: 60 };
const LABEL_GAP = 15;

/** Pushes end-of-line labels apart so they never overlap, keeping their order. */
function spreadLabels(positions: Array<{ key: string; y: number }>): Record<string, number> {
  const sorted = [...positions].sort((a, b) => a.y - b.y);
  const placed: Array<{ key: string; y: number }> = [];
  for (const item of sorted) {
    const previous = placed[placed.length - 1];
    placed.push({ key: item.key, y: previous ? Math.max(item.y, previous.y + LABEL_GAP) : item.y });
  }
  return Object.fromEntries(placed.map((item) => [item.key, item.y]));
}

/** Cumulative profit of each setup and of manual trades, each on its own line, over time. */
export function PnlChart({ series, points, startTime, endTime, startLabel, endLabel }: PnlChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const totalAt = (point: PnlPoint | undefined, key: string) => point?.totals[key] ?? 0;
  const x = linearScale([startTime, Math.max(endTime, startTime + 1)], [MARGIN.left, WIDTH - MARGIN.right]);
  const y = linearScale(paddedDomain(points.flatMap((p) => series.map((s) => totalAt(p, s.key)))), [HEIGHT - MARGIN.bottom, MARGIN.top]);
  const last = points[points.length - 1];
  const point = active === null ? null : points[active];
  const activeGroup = point ? series.find((s) => s.key === point.source) : undefined;

  const pathFor = (key: string) =>
    stepPath([[x(startTime), y(0)], ...points.map((p): [number, number] => [x(p.time), y(totalAt(p, key))]), [x(endTime), y(totalAt(last, key))]]);
  const labelY = spreadLabels(series.map((s) => ({ key: s.key, y: y(totalAt(last, s.key)) })));

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    if (points.length === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const px = MARGIN.left + ((event.clientX - box.left) / box.width) * (WIDTH - MARGIN.left - MARGIN.right);
    const distances = points.map((p) => Math.abs(x(p.time) - px));
    setActive(distances.indexOf(Math.min(...distances)));
  };

  return (
    <figure className="chart">
      <div className="legend" aria-hidden="true">
        {series.map((s) => (
          <span key={s.key}><i className="swatch swatch-line" style={{ background: `var(--series-${s.color})` }} />{s.label}</span>
        ))}
      </div>
      <div className="chart-scroll">
        <div className="chart-frame">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Cumulative profit of each setup and of manual trades over time">
            {niceTicks(y.domain[0], y.domain[1], 4).map((tick) => (
              <g key={tick}>
                <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "axis-zero" : "grid"} />
                <text x={MARGIN.left - 8} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{formatWholeMoney(tick)}</text>
              </g>
            ))}
            <text x={MARGIN.left} y={HEIGHT - 6} className="tick">{startLabel}</text>
            <text x={WIDTH - MARGIN.right} y={HEIGHT - 6} className="tick" textAnchor="end">{endLabel}</text>

            {series.map((s) => (
              <g key={s.key}>
                <path d={pathFor(s.key)} className="line" style={{ stroke: `var(--series-${s.color})` }} />
                <text x={WIDTH - MARGIN.right + 8} y={labelY[s.key]} className="direct-label direct-label-strong" dominantBaseline="middle">
                  {s.label} {formatSignedMoney(totalAt(last, s.key))}
                </text>
              </g>
            ))}
            {point && activeGroup && (
              <>
                <line x1={x(point.time)} x2={x(point.time)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} className="crosshair" />
                <circle cx={x(point.time)} cy={y(totalAt(point, point.source))} r={5} className="dot" style={{ fill: `var(--series-${activeGroup.color})` }} />
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
            <div className="tooltip" style={{ left: `${(x(point.time) / WIDTH) * 100}%`, top: `${(y(totalAt(point, point.source)) / HEIGHT) * 100}%` }}>
              <strong>{point.label}</strong>
              <span>{activeGroup?.label ?? "Trade"} {formatSignedMoney(point.profit)}</span>
              {series.map((s) => (
                <span key={s.key}>{s.label} total {formatSignedMoney(totalAt(point, s.key))}</span>
              ))}
            </div>
          )}
          {points.length === 0 && <p className="chart-empty">No closed trades yet.</p>}
        </div>
      </div>
    </figure>
  );
}
