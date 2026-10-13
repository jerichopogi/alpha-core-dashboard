"use client";

import { useState } from "react";

export type TradeFilter = "ea" | "manual" | "all";

export interface TradeRow {
  id: number;
  source: "ea" | "manual";
  closed: string;
  side: "buy" | "sell";
  volume: string;
  entry: string;
  exit: string;
  held: string;
  exitReason: string;
  profit: string;
  r: string;
  outcome: "win" | "loss" | "flat";
}

export interface StatItem {
  label: string;
  value: string;
}

interface TradesPanelProps {
  rows: TradeRow[];
  stats: Record<TradeFilter, StatItem[]>;
}

const TABS: Array<{ key: TradeFilter; label: string }> = [
  { key: "ea", label: "EA" },
  { key: "manual", label: "Manual" },
  { key: "all", label: "All" },
];

export function TradesPanel({ rows, stats }: TradesPanelProps) {
  const [filter, setFilter] = useState<TradeFilter>("ea");
  const visible = rows.filter((row) => filter === "all" || row.source === filter);
  const countFor = (key: TradeFilter) => rows.filter((row) => key === "all" || row.source === key).length;

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Trade source">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={filter === tab.key}
            className="tab"
            onClick={() => setFilter(tab.key)}
          >
            {tab.label} <span className="tab-count">{countFor(tab.key)}</span>
          </button>
        ))}
      </div>

      <dl className="stat-strip">
        {stats[filter].map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      {visible.length === 0 ? (
        <p className="empty">{filter === "ea" ? "The EA has not closed a trade yet." : "No closed trades here yet."}</p>
      ) : (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Closed</th>
                <th>Source</th>
                <th>Side</th>
                <th className="num">Lots</th>
                <th className="num">Entry</th>
                <th className="num">Exit</th>
                <th>Held</th>
                <th>Closed by</th>
                <th className="num">Profit</th>
                <th className="num">R</th>
              </tr>
            </thead>
            <tbody>
              {[...visible].reverse().map((row) => (
                <tr key={row.id}>
                  <td>{row.closed}</td>
                  <td><span className={`tag tag-${row.source}`}>{row.source === "ea" ? "EA" : "Manual"}</span></td>
                  <td className="side">{row.side}</td>
                  <td className="num">{row.volume}</td>
                  <td className="num">{row.entry}</td>
                  <td className="num">{row.exit}</td>
                  <td>{row.held}</td>
                  <td>{row.exitReason}</td>
                  <td className={`num outcome-${row.outcome}`}>{row.profit}</td>
                  <td className="num">{row.r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
