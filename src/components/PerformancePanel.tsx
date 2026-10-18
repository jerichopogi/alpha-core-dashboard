"use client";

import { useState } from "react";
import type { Bucket, MonthResult } from "@/lib/analytics";
import { formatPercent, formatR, formatSignedMoney } from "@/lib/format";
import type { PerformanceView } from "@/lib/insights";
import { BarChart } from "./BarChart";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MIN_CELL_ALPHA = 0.14;
const MAX_CELL_ALPHA = 0.5;

const outcome = (value: number) => (value > 0 ? "win" : value < 0 ? "loss" : "flat");
const compactMoney = (value: number) => {
  const abs = Math.abs(value);
  const text = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${Math.round(abs)}`;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}`;
};
const losingBin = (b: Bucket) => b.key === "low" || Number(b.key) < 0;

function SideTable({ sides }: { sides: Bucket[] }) {
  return (
    <div className="table-scroll">
    <table className="ledger">
      <thead>
        <tr><th>Side</th><th className="num">Trades</th><th className="num">Won</th><th className="num">Net</th><th className="num">Avg R</th></tr>
      </thead>
      <tbody>
        {sides.map((s) => (
          <tr key={s.key}>
            <td className="strong">{s.label}</td>
            <td className="num">{s.trades}</td>
            <td className="num">{s.trades ? formatPercent(s.wins / s.trades, 0) : "–"}</td>
            <td className={`num outcome-${outcome(s.net)}`}>{formatSignedMoney(s.net)}</td>
            <td className="num">{formatR(s.avgR)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

const monthName = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** Phone layout of the same months: newest first, one row each. */
function MonthList({ months }: { months: MonthResult[] }) {
  return (
    <ul className="month-list">
      {[...months].reverse().map((m) => (
        <li key={m.month}>
          <span>{monthName.format(new Date(`${m.month}-01T00:00:00Z`))}</span>
          <span className="muted">{m.trades} trades · {formatPercent(m.wins / m.trades, 0)} won</span>
          <strong className={`outcome-${outcome(m.net)}`}>{formatSignedMoney(m.net)}</strong>
        </li>
      ))}
    </ul>
  );
}

/** Years down, months across; each cell tinted by its result relative to the biggest month. */
function MonthGrid({ months }: { months: MonthResult[] }) {
  if (months.length === 0) return <p className="empty">No closed trades yet.</p>;
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const years = [...new Set(months.map((m) => m.month.slice(0, 4)))].sort().reverse();
  const biggest = Math.max(...months.map((m) => Math.abs(m.net)), 1);
  const alpha = (net: number) => MIN_CELL_ALPHA + (Math.abs(net) / biggest) * (MAX_CELL_ALPHA - MIN_CELL_ALPHA);

  return (
    <>
    <MonthList months={months} />
    <div className="table-scroll month-grid-wrap">
      <table className="month-grid">
        <thead>
          <tr><th scope="col">Year</th>{MONTHS.map((m) => <th key={m} scope="col">{m}</th>)}<th scope="col">Year</th></tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const yearMonths = months.filter((m) => m.month.startsWith(year));
            const total = yearMonths.reduce((t, m) => t + m.net, 0);
            return (
              <tr key={year}>
                <th scope="row">{year}</th>
                {MONTHS.map((name, i) => {
                  const m = byMonth.get(`${year}-${String(i + 1).padStart(2, "0")}`);
                  if (!m) return <td key={name} className="month-cell month-idle" />;
                  return (
                    <td key={name} className={`month-cell month-${outcome(m.net)}`} style={{ "--cell-alpha": alpha(m.net) } as React.CSSProperties}
                      title={`${name} ${year}: ${formatSignedMoney(m.net)}, ${m.trades} trades, ${formatPercent(m.wins / m.trades, 0)} won`}>
                      {compactMoney(m.net)}
                    </td>
                  );
                })}
                <td className={`month-total outcome-${outcome(total)}`}>{compactMoney(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

export function PerformancePanel({ views }: { views: PerformanceView[] }) {
  const [key, setKey] = useState(views[0]?.key ?? "all");
  const view = views.find((v) => v.key === key) ?? views[0];
  if (!view) return null;

  return (
    <section className="panel" aria-labelledby="perf-title">
      <div className="panel-head">
        <h2 id="perf-title" className="panel-title">Performance</h2>
        <div className="tabs" role="tablist" aria-label="Whose trades to analyse">
          {views.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={v.key === view.key} className="tab" onClick={() => setKey(v.key)}>
              {v.label}<span className="tab-count">{v.count}</span>
            </button>
          ))}
        </div>
        <span className="panel-meta">Closed trades · Philippine time</span>
      </div>
      <div className="panel-body">
        <dl className="stat-strip">
          {view.stats.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd className={item.tone ? `outcome-${item.tone}` : undefined}>{item.value}</dd>
            </div>
          ))}
        </dl>

        {view.count === 0 ? (
          <p className="empty">No closed trades here yet.</p>
        ) : (
          <div className="perf-grid">
            <figure className="perf-cell perf-wide">
              <figcaption className="subhead">Net by hour opened</figcaption>
              <BarChart buckets={view.hours} metric="net" label="Net profit by the Philippine hour the trade was opened" labelEvery={3} />
            </figure>
            <figure className="perf-cell">
              <figcaption className="subhead">Net by weekday</figcaption>
              <BarChart buckets={view.weekdays} metric="net" label="Net profit by weekday" />
            </figure>
            <figure className="perf-cell perf-wide">
              <figcaption className="subhead">Result per trade, in R</figcaption>
              <BarChart buckets={view.rBins} metric="trades" label="How many trades ended in each half-R band" labelEvery={2} isLoss={losingBin} />
            </figure>
            <figure className="perf-cell">
              <figcaption className="subhead">Long against short</figcaption>
              <SideTable sides={view.sides} />
            </figure>
            <figure className="perf-cell perf-full">
              <figcaption className="subhead">Month by month</figcaption>
              <MonthGrid months={view.months} />
            </figure>
          </div>
        )}
      </div>
    </section>
  );
}
