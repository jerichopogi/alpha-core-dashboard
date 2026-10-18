import Link from "next/link";
import type { Kpi, RiskRow } from "@/lib/insights";
import { DAILY_LOSS_CAP, type Objective } from "@/lib/objectives";
import type { DashboardView, SetupView } from "@/lib/view";
import { Icon, type IconName } from "./icons";
import type { TradeRow } from "./TradesPanel";

const RATIO_METER_MAX = 2;
const RECENT_TRADES = 6;
const KPI_ICON: Record<Kpi["key"], IconName> = {
  balance: "wallet", equity: "pulse", today: "calendar", risk: "pulse", drawdown: "analytics", result: "trophy",
};
const STATE_LABEL: Record<Objective["state"], { text: string; tone: string }> = {
  passed: { text: "Passed", tone: "win" },
  "on-track": { text: "In progress", tone: "accent" },
  behind: { text: "Behind", tone: "loss" },
  ok: { text: "Within limit", tone: "win" },
  warning: { text: "Close to limit", tone: "warn" },
  breached: { text: "Breached", tone: "loss" },
  paused: { text: "Done for today", tone: "warn" },
  neutral: { text: "No data", tone: "" },
};

export function PageHeader({ title, view }: { title: string; view: DashboardView }) {
  return (
    <header className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">{view.account ? view.account.name : "No account data yet"} · {view.accountDetail}</p>
      </div>
      <div className="page-head-end">
        {view.setups.length === 0 ? (
          <span className="chip"><i className="chip-dot" aria-hidden="true" />Waiting for the EA</span>
        ) : (
          view.setups.map((setup) => (
            <span key={setup.key} className={`chip ${setup.status.state === "running" ? "chip-win chip-live" : "chip-loss"}`} title={setup.status.detail}>
              <i className="chip-dot" aria-hidden="true" />{setup.label} · {setup.status.label}
            </span>
          ))
        )}
      </div>
    </header>
  );
}

export function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <section className="kpis" aria-label="Account at a glance">
      {kpis.map((kpi) => {
        // Only a money figure in the detail line gets a coloured chip.
        const detailTone = kpi.detailTone;
        return (
          <div key={kpi.key} className="kpi">
            <div className="kpi-top">
              <span className="kpi-icon"><Icon name={KPI_ICON[kpi.key]} /></span>
              {kpi.label}
            </div>
            <div className={`kpi-value${kpi.tone === "win" || kpi.tone === "loss" ? ` outcome-${kpi.tone}` : ""}`}>{kpi.value}</div>
            <div className="kpi-detail">
              {detailTone && detailTone !== "flat" && detailTone !== "neutral" ? <span className={`chip chip-${detailTone}`}>{kpi.detail}</span> : kpi.detail}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function ObjectivesCard({ objectives }: { objectives: Objective[] }) {
  return (
    <section className="panel span-4" aria-labelledby="obj-title">
      <div className="panel-head">
        <h2 id="obj-title" className="panel-title">Objectives</h2>
      </div>
      <div className="panel-body">
        <ul className="objectives">
          {objectives.map((o) => {
            const state = STATE_LABEL[o.state];
            return (
              <li key={o.key} className="objective">
                <div className="objective-head">
                  <span className="objective-title">{o.title}</span>
                  <span className={`chip${state.tone ? ` chip-${state.tone}` : ""}`}>{state.text}</span>
                </div>
                <div className="objective-figures">
                  <strong>{o.value}</strong>
                  <span>of {o.target}</span>
                </div>
                <div className={`progress progress-${o.state}`} role="progressbar" aria-label={o.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(o.progress * 100)}>
                  <span style={{ width: `${o.progress * 100}%` }} />
                </div>
                <p className="muted">{o.detail}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function SetupStatus({ setup }: { setup: SetupView }) {
  const meter = (value: number) => `${Math.min(1, value / RATIO_METER_MAX) * 100}%`;
  const passes = setup.ratio >= setup.ratioMin;
  return (
    <div className="setup">
      <div className="setup-head">
        <span className={`tag tag-c${setup.color}`}>{setup.label}</span>
        <span className="muted">{setup.market}</span>
        <span className={`chip ${setup.status.state === "running" ? "chip-win" : "chip-loss"}`}>{setup.status.label}</span>
      </div>
      <dl className="facts">
        <div><dt>Risk per trade</dt><dd>{setup.risk.replace(" per trade", "")} · {setup.riskMoney}</dd></div>
        <div>
          <dt>Losses today</dt>
          <dd className="loss-dots" aria-label={`${setup.lossesToday} of ${DAILY_LOSS_CAP}`}>
            {Array.from({ length: DAILY_LOSS_CAP }, (_, i) => <i key={i} className={i < setup.lossesToday ? "used" : undefined} aria-hidden="true" />)}
            <span>{setup.lossesToday} of {DAILY_LOSS_CAP}</span>
          </dd>
        </div>
      </dl>
      <div className="meter-block">
        <div className="meter-head"><span>Volatility ratio</span><strong>{setup.ratio.toFixed(2)}</strong></div>
        <div className="meter" role="img" aria-label={`Volatility ratio ${setup.ratio.toFixed(2)}, needs ${setup.ratioMin} to trade`}>
          <span className={`meter-fill${passes ? " meter-pass" : ""}`} style={{ width: meter(setup.ratio) }} />
          <span className="meter-threshold" style={{ left: meter(setup.ratioMin) }} />
        </div>
        <p className="muted">
          {!setup.filterOn ? "Filter off: every cross is considered." : passes ? `At or above ${setup.ratioMin}: a cross now would be taken.` : `Below ${setup.ratioMin}: a cross now would be skipped.`}
        </p>
      </div>
    </div>
  );
}

export function EaCard({ view }: { view: DashboardView }) {
  return (
    <section className="panel span-4" aria-labelledby="ea-title">
      <div className="panel-head">
        <h2 id="ea-title" className="panel-title">Expert advisor</h2>
      </div>
      <div className="panel-body">
        {view.setups.length === 0 ? <p className="empty">Status appears after the EA&apos;s first report.</p> : view.setups.map((s) => <SetupStatus key={s.key} setup={s} />)}
      </div>
    </section>
  );
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

function PositionRisk({ row }: { row: RiskRow }) {
  return (
    <li className="position">
      <div className="position-head">
        <span className={`tag tag-c${row.group.color}`}>{row.group.label}</span>
        <span className={`side-badge side-${row.side}`}>{row.side === "buy" ? "Long" : "Short"}</span>
        <span className="muted">{row.volume} lots · opened {row.opened}</span>
        <span className={`position-pnl outcome-${row.outcome}`}>{row.profit}<small>{row.rNow}</small></span>
      </div>
      {row.progress !== null && row.entryAt !== null ? (
        <div className="track" role="img" aria-label={`Price ${row.now}, stop ${row.stop}, entry ${row.entry}, target ${row.target}`}>
          <span className="track-loss" style={{ width: pct(row.entryAt) }} />
          <span className="track-entry" style={{ left: pct(row.entryAt) }} />
          <span className={`track-now track-now-${row.outcome}`} style={{ left: pct(row.progress) }} />
        </div>
      ) : (
        <p className="muted outcome-warn">No stop or target on this position.</p>
      )}
      <div className="track-labels">
        <span>Stop<b>{row.stop}</b></span>
        <span>Now<b>{row.now}</b></span>
        <span>Target<b>{row.target}</b></span>
      </div>
      <p className="muted">Entry {row.entry} · at risk {row.risk}</p>
    </li>
  );
}

export function PositionsCard({ rows, openRisk }: { rows: RiskRow[]; openRisk: string }) {
  return (
    <section className="panel span-8" aria-labelledby="pos-title">
      <div className="panel-head">
        <h2 id="pos-title" className="panel-title">Open positions</h2>
        <span className="panel-meta">{openRisk} at risk</span>
      </div>
      <div className="panel-body">
        {rows.length === 0 ? <p className="empty">No open positions.</p> : <ul className="positions">{rows.map((r) => <PositionRisk key={r.ticket} row={r} />)}</ul>}
      </div>
    </section>
  );
}

export function RecentTrades({ rows }: { rows: TradeRow[] }) {
  const recent = [...rows].reverse().slice(0, RECENT_TRADES);
  return (
    <section className="panel" aria-labelledby="recent-title">
      <div className="panel-head">
        <h2 id="recent-title" className="panel-title">Recent trades</h2>
        <Link href="/trades" className="panel-link">View all →</Link>
      </div>
      {recent.length === 0 ? (
        <div className="panel-body"><p className="empty">No closed trades yet.</p></div>
      ) : (
        <div className="panel-flush table-scroll">
          <table className="ledger">
            <thead>
              <tr><th>Closed</th><th>Source</th><th>Side</th><th className="num">Lots</th><th className="num">Entry</th><th className="num">Exit</th><th>Closed by</th><th className="num">Profit</th><th className="num">R</th></tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.id}>
                  <td>{row.closed}</td>
                  <td><span className={`tag tag-c${row.color}`}>{row.sourceLabel}</span></td>
                  <td><span className={`side-badge side-${row.side}`}>{row.side === "buy" ? "Long" : "Short"}</span></td>
                  <td className="num">{row.volume}</td>
                  <td className="num">{row.entry}</td>
                  <td className="num">{row.exit}</td>
                  <td>{row.exitReason}</td>
                  <td className={`num strong outcome-${row.outcome}`}>{row.profit}</td>
                  <td className="num">{row.r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
