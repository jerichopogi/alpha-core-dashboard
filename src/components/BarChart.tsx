"use client";

import { useState } from "react";
import type { Bucket } from "@/lib/analytics";
import { formatPercent, formatR, formatSignedMoney, formatWholeMoney } from "@/lib/format";
import { linearScale, niceTicks, paddedDomain } from "./chart-utils";
import { useWidth } from "./useWidth";

const HEIGHT = 170;
const MARGIN = { top: 10, right: 8, bottom: 22, left: 52 };
const BAR_GAP = 2;
const MAX_BAR = 28;
const CHAR_WIDTH = 6.4; // 10.5px monospace tick text
const LABEL_PADDING = 10;

interface BarChartProps {
  buckets: Bucket[];
  /** "net": profit per bucket, above or below zero. "trades": how many trades fell in each bucket. */
  metric: "net" | "trades";
  label: string;
  /** Show every n-th category label so they never collide. */
  labelEvery?: number;
  /** For "trades": which buckets count as losing (drawn red). */
  isLoss?: (bucket: Bucket) => boolean;
}

export function BarChart({ buckets, metric, label, labelEvery = 1, isLoss }: BarChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const valueOf = (b: Bucket) => (metric === "net" ? b.net : b.trades);
  const values = buckets.map(valueOf);
  const y = linearScale(metric === "net" ? paddedDomain(values, 0.08) : [0, Math.max(1, ...values) * 1.1], [HEIGHT - MARGIN.bottom, MARGIN.top]);
  const slot = (width - MARGIN.left - MARGIN.right) / buckets.length;
  const barWidth = Math.min(MAX_BAR, Math.max(2, slot - BAR_GAP));
  const lossy = (b: Bucket) => (metric === "net" ? b.net < 0 : (isLoss?.(b) ?? false));
  const ticks = metric === "net" ? niceTicks(y.domain[0], y.domain[1], 4) : niceTicks(0, y.domain[1], 3).filter((t) => Number.isInteger(t));
  const point = active === null ? null : buckets[active];
  // Thin the category labels until the longest one fits its share of the axis.
  const longest = Math.max(...buckets.map((b) => b.label.length));
  const every = Math.max(labelEvery, Math.ceil((longest * CHAR_WIDTH + LABEL_PADDING) / slot));

  return (
    <div ref={ref} className="chart-fluid">
      <svg width={width} height={HEIGHT} role="img" aria-label={label}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "axis-zero" : "grid"} />
            <text x={MARGIN.left - 6} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">
              {metric === "net" ? formatWholeMoney(tick) : tick}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const cx = MARGIN.left + slot * (i + 0.5);
          const v = valueOf(b);
          const top = Math.min(y(v), y(0));
          const height = Math.max(v === 0 ? 0 : 1.5, Math.abs(y(v) - y(0)));
          return (
            <g key={b.key}>
              {b.trades > 0 && (
                <rect x={cx - barWidth / 2} y={top} width={barWidth} height={height} rx={Math.min(3, barWidth / 3)}
                  className={`bar ${lossy(b) ? "bar-loss" : "bar-win"}${active === i ? " bar-active" : ""}`} />
              )}
              {i % every === 0 && (
                <text x={cx} y={HEIGHT - 6} className="tick" textAnchor="middle">{b.label}</text>
              )}
              <rect x={cx - slot / 2} y={MARGIN.top} width={slot} height={HEIGHT - MARGIN.top - MARGIN.bottom} fill="transparent"
                onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} />
            </g>
          );
        })}
      </svg>
      {point && (
        <div className="tooltip" style={{ left: Math.min(MARGIN.left + slot * (active! + 0.5), width - 170), top: 8 }}>
          <strong>{point.label}</strong>
          <span>{point.trades} {point.trades === 1 ? "trade" : "trades"}{point.trades ? `, ${formatPercent(point.wins / point.trades, 0)} won` : ""}</span>
          {point.trades > 0 && <span>Net {formatSignedMoney(point.net)} · avg {formatR(point.avgR)}</span>}
        </div>
      )}
    </div>
  );
}
