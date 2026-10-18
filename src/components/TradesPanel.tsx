"use client";

import { useState } from "react";
import type { Group } from "@/lib/groups";

const ALL = "all";

export interface TradeRow {
  id: number;
  /** Key of the group that opened the trade. */
  source: string;
  sourceLabel: string;
  color: number;
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
  groups: Group[];
  rows: TradeRow[];
  /** Stats per group key, plus "all". Left out when the page shows them elsewhere. */
  stats?: Record<string, StatItem[]>;
}

export function TradesPanel({ groups, rows, stats }: TradesPanelProps) {
  const tabs = [...groups.map((g) => ({ key: g.key, label: g.label })), { key: ALL, label: "All" }];
  const [filter, setFilter] = useState(tabs[0].key);
  const active = tabs.some((tab) => tab.key === filter) ? filter : tabs[0].key;
  const matches = (row: TradeRow, key: string) => key === ALL || row.source === key;
  const visible = rows.filter((row) => matches(row, active));

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Whose trades to show">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} className="tab" onClick={() => setFilter(tab.key)}>
            {tab.label} <span className="tab-count">{rows.filter((row) => matches(row, tab.key)).length}</span>
          </button>
        ))}
      </div>

      {stats && (
        <dl className="stat-strip">
          {(stats[active] ?? []).map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {visible.length === 0 ? (
        <p className="empty">No closed trades here yet.</p>
      ) : (
        <div className="table-scroll scroll-y">
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
                  <td><span className={`tag tag-c${row.color}`}>{row.sourceLabel}</span></td>
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
