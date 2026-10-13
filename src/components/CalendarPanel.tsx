"use client";

import { useState } from "react";
import { monthGrid, shiftMonth, type DayResult } from "@/lib/calendar";
import { formatSignedMoney } from "@/lib/format";
import type { Group } from "@/lib/groups";

const ALL = "all";

interface CalendarPanelProps {
  days: DayResult[];
  groups: Group[];
  /** Earliest and latest months that can be shown, as YYYY-MM. */
  firstMonth: string;
  lastMonth: string;
  /** Today's Philippine date, as YYYY-MM-DD. */
  today: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthTitle = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const outcomeOf = (value: number) => (value > 0 ? "win" : value < 0 ? "loss" : "flat");
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** A month of closed-trade profit and loss, one cell per Philippine day. */
export function CalendarPanel({ days, groups, firstMonth, lastMonth, today }: CalendarPanelProps) {
  const [month, setMonth] = useState(lastMonth);
  const [source, setSource] = useState(ALL);
  const tabs = [{ key: ALL, label: "All" }, ...groups.map((g) => ({ key: g.key, label: g.label }))];
  const valueOf = (day: DayResult | undefined) => (!day ? 0 : source === ALL ? day.total : (day.bySource[source] ?? 0));
  const tradedOn = (day: DayResult | undefined) => day !== undefined && (source === ALL || source in day.bySource);

  const byDate = new Map(days.map((day) => [day.date, day]));
  const grid = monthGrid(month);
  const active = days.filter((day) => day.date.startsWith(month) && tradedOn(day));
  const monthTotal = sum(active.map(valueOf));
  const [year, monthNumber] = month.split("-").map(Number);
  const breakdown = (day: DayResult) =>
    [...groups.filter((g) => g.key in day.bySource).map((g) => `${g.label} ${formatSignedMoney(day.bySource[g.key])}`), `${day.trades} trades, ${day.wins} won`].join(" · ");

  return (
    <div className="calendar">
      <div className="calendar-bar">
        <div className="calendar-nav">
          <button type="button" className="nav-button" onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= firstMonth} aria-label="Previous month">←</button>
          <h3 className="calendar-month">{monthTitle.format(new Date(Date.UTC(year, monthNumber - 1, 1)))}</h3>
          <button type="button" className="nav-button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= lastMonth} aria-label="Next month">→</button>
        </div>
        <div className="tabs calendar-tabs" role="tablist" aria-label="Whose trades to show">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={source === tab.key} className="tab" onClick={() => setSource(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <dl className="stat-strip calendar-summary">
        <div><dt>Month result</dt><dd className={`outcome-${outcomeOf(monthTotal)}`}>{formatSignedMoney(monthTotal)}</dd></div>
        <div><dt>Winning days</dt><dd>{active.filter((day) => valueOf(day) > 0).length}</dd></div>
        <div><dt>Losing days</dt><dd>{active.filter((day) => valueOf(day) < 0).length}</dd></div>
      </dl>

      <div className="table-scroll">
        <table className="calendar-grid">
          <thead>
            <tr>
              {WEEKDAYS.map((name) => <th key={name} scope="col">{name}</th>)}
              <th scope="col" className="week-col">Week</th>
            </tr>
          </thead>
          <tbody>
            {grid.weeks.map((week, index) => {
              const weekDays = week.map((date) => (date ? byDate.get(date) : undefined));
              const weekTraded = weekDays.some(tradedOn);
              const weekTotal = sum(weekDays.map(valueOf));
              return (
                <tr key={index}>
                  {week.map((date, cell) => {
                    if (!date) return <td key={cell} className="day day-empty" />;
                    const day = byDate.get(date);
                    const traded = tradedOn(day);
                    const value = valueOf(day);
                    return (
                      <td
                        key={cell}
                        className={`day day-${traded ? outcomeOf(value) : "idle"}${date === today ? " day-today" : ""}`}
                        title={day ? breakdown(day) : undefined}
                      >
                        <span className="day-number">{Number(date.slice(8))}</span>
                        {traded && day && (
                          <>
                            <span className="day-value">{formatSignedMoney(value)}</span>
                            {source === ALL && <span className="day-count">{day.trades} {day.trades === 1 ? "trade" : "trades"}</span>}
                          </>
                        )}
                      </td>
                    );
                  })}
                  <td className={`day week-col ${weekTraded ? `outcome-${outcomeOf(weekTotal)}` : ""}`}>
                    {weekTraded && <span className="day-value">{formatSignedMoney(weekTotal)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
