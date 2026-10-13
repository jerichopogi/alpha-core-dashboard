"use client";

import { useState } from "react";
import { monthGrid, shiftMonth, type DayResult } from "@/lib/calendar";
import { formatSignedMoney } from "@/lib/format";

type Source = "total" | "ea" | "manual";

interface CalendarPanelProps {
  days: DayResult[];
  /** Earliest and latest months that can be shown, as YYYY-MM. */
  firstMonth: string;
  lastMonth: string;
  /** Today's Philippine date, as YYYY-MM-DD. */
  today: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SOURCES: Array<{ key: Source; label: string }> = [
  { key: "total", label: "All" },
  { key: "ea", label: "EA" },
  { key: "manual", label: "Manual" },
];
const monthTitle = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const outcomeOf = (value: number) => (value > 0 ? "win" : value < 0 ? "loss" : "flat");
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** A month of closed-trade profit and loss, one cell per Philippine day. */
export function CalendarPanel({ days, firstMonth, lastMonth, today }: CalendarPanelProps) {
  const [month, setMonth] = useState(lastMonth);
  const [source, setSource] = useState<Source>("total");
  const byDate = new Map(days.map((day) => [day.date, day]));
  const grid = monthGrid(month);
  const inMonth = days.filter((day) => day.date.startsWith(month));
  const active = inMonth.filter((day) => source === "total" || day[source] !== 0);
  const monthTotal = sum(inMonth.map((day) => day[source]));
  const greenDays = active.filter((day) => day[source] > 0).length;
  const redDays = active.filter((day) => day[source] < 0).length;
  const [year, monthNumber] = month.split("-").map(Number);

  return (
    <div className="calendar">
      <div className="calendar-bar">
        <div className="calendar-nav">
          <button type="button" className="nav-button" onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= firstMonth} aria-label="Previous month">←</button>
          <h3 className="calendar-month">{monthTitle.format(new Date(Date.UTC(year, monthNumber - 1, 1)))}</h3>
          <button type="button" className="nav-button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= lastMonth} aria-label="Next month">→</button>
        </div>
        <div className="tabs calendar-tabs" role="tablist" aria-label="Whose trades to show">
          {SOURCES.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={source === item.key} className="tab" onClick={() => setSource(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <dl className="stat-strip calendar-summary">
        <div><dt>Month result</dt><dd className={`outcome-${outcomeOf(monthTotal)}`}>{formatSignedMoney(monthTotal)}</dd></div>
        <div><dt>Winning days</dt><dd>{greenDays}</dd></div>
        <div><dt>Losing days</dt><dd>{redDays}</dd></div>
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
              const weekTotal = sum(week.map((date) => (date ? (byDate.get(date)?.[source] ?? 0) : 0)));
              const weekTraded = week.some((date) => date && (byDate.get(date)?.[source] ?? 0) !== 0);
              return (
                <tr key={index}>
                  {week.map((date, cell) => {
                    if (!date) return <td key={cell} className="day day-empty" />;
                    const day = byDate.get(date);
                    const value = day?.[source] ?? 0;
                    const traded = day !== undefined && (source === "total" || value !== 0);
                    const state = traded ? outcomeOf(value) : "idle";
                    return (
                      <td
                        key={cell}
                        className={`day day-${state}${date === today ? " day-today" : ""}`}
                        title={day ? `EA ${formatSignedMoney(day.ea)} · Manual ${formatSignedMoney(day.manual)} · ${day.trades} trades, ${day.wins} won` : undefined}
                      >
                        <span className="day-number">{Number(date.slice(8))}</span>
                        {traded && day && (
                          <>
                            <span className="day-value">{formatSignedMoney(value)}</span>
                            <span className="day-count">{source === "total" ? `${day.trades} ${day.trades === 1 ? "trade" : "trades"}` : " "}</span>
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
