import { logout } from "@/app/login/actions";
import type { Insights, RiskRow } from "@/lib/insights";
import type { DashboardView, SetupView } from "@/lib/view";

const MAX_LOSSES_PER_DAY = 2;
const RATIO_METER_MAX = 2;

export function TopBar({ view }: { view: DashboardView }) {
  return (
    <header className="topbar">
      <p className="wordmark">Alpha Core <span>/ XAUUSD</span></p>
      {view.account && <p className="topbar-meta">{view.account.name}</p>}
      <div className="topbar-end">
        {view.setups.length === 0 ? (
          <span className="pill"><i className="pill-dot" aria-hidden="true" />Waiting for the EA</span>
        ) : (
          <ul className="status-list" aria-label="EA setups">
            {view.setups.map((setup) => (
              <li key={setup.key} className={`pill pill-${setup.status.state}`} title={setup.status.detail}>
                <i className="pill-dot" aria-hidden="true" />
                <strong>{setup.label}</strong> {setup.status.label}
              </li>
            ))}
          </ul>
        )}
        <span className="topbar-meta">{view.accountDetail}</span>
        <form action={logout}>
          <button type="submit" className="link-button">Sign out</button>
        </form>
      </div>
    </header>
  );
}

export function KpiStrip({ insights }: { insights: Insights }) {
  return (
    <section className="kpis" aria-label="Account at a glance">
      {insights.kpis.map((kpi) => (
        <div key={kpi.label} className={`kpi kpi-${kpi.tone}`}>
          <span className="kpi-label">{kpi.label}</span>
          <span className={`kpi-value${kpi.tone === "win" || kpi.tone === "loss" ? ` outcome-${kpi.tone}` : ""}`}>{kpi.value}</span>
          <span className={`kpi-detail${kpi.tone === "warn" ? " outcome-warn" : ""}${kpi.detailTone && kpi.detailTone !== "flat" ? ` outcome-${kpi.detailTone}` : ""}`}>{kpi.detail}</span>
        </div>
      ))}
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
        <span className={`setup-state outcome-${setup.status.state === "running" ? "win" : "loss"}`}>{setup.status.label}</span>
      </div>
      <dl className="facts">
        <div><dt className="label">Risk per trade</dt><dd>{setup.risk.replace(" per trade", "")} · {setup.riskMoney}</dd></div>
        <div>
          <dt className="label">Losses today</dt>
          <dd className="loss-dots" aria-label={`${setup.lossesToday} of ${MAX_LOSSES_PER_DAY}`}>
            {Array.from({ length: MAX_LOSSES_PER_DAY }, (_, i) => (
              <i key={i} className={i < setup.lossesToday ? "used" : undefined} aria-hidden="true" />
            ))}
            <span>{setup.lossesToday} of {MAX_LOSSES_PER_DAY}{setup.lossesToday >= MAX_LOSSES_PER_DAY ? " · done for today" : ""}</span>
          </dd>
        </div>
      </dl>
      <div className="meter-block">
        <div className="meter-head"><span className="label">Volatility ratio</span><strong>{setup.ratio.toFixed(2)}</strong></div>
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

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

function PositionRisk({ row }: { row: RiskRow }) {
  return (
    <li className="position">
      <div className="position-head">
        <span className={`tag tag-c${row.group.color}`}>{row.group.label}</span>
        <span className={`side-badge side-${row.side}`}>{row.side === "buy" ? "Long" : "Short"}</span>
        <span className="muted">{row.volume} lots · {row.opened}</span>
        <span className={`position-pnl outcome-${row.outcome}`}>{row.profit} <small>{row.rNow}</small></span>
      </div>
      {row.progress !== null && row.entryAt !== null ? (
        <div className="track" role="img" aria-label={`Price ${row.now}, stop ${row.stop}, entry ${row.entry}, target ${row.target}`}>
          <span className="track-loss" style={{ width: pct(row.entryAt) }} />
          <span className="track-entry" style={{ left: pct(row.entryAt) }} />
          <span className={`track-now track-now-${row.outcome}`} style={{ left: pct(row.progress) }} />
        </div>
      ) : (
        <p className="outcome-warn muted">No stop or target on this position.</p>
      )}
      <div className="track-labels">
        <span>Stop {row.stop}</span>
        <span>Now {row.now}</span>
        <span>Target {row.target}</span>
      </div>
      <p className="muted">Risk {row.risk} · entry {row.entry}</p>
    </li>
  );
}

export function RiskPanel({ view, insights }: { view: DashboardView; insights: Insights | null }) {
  const rows = insights?.riskRows ?? [];
  return (
    <section className="panel span-4" aria-labelledby="risk-title">
      <div className="panel-head">
        <h2 id="risk-title" className="panel-title">Risk now</h2>
        {insights && <span className="panel-meta">{insights.openRisk} at risk</span>}
      </div>
      <div className="panel-body">
        {view.setups.length === 0 && <p className="empty">Each setup&apos;s risk, losses today and volatility appear after its first report.</p>}
        {view.setups.map((setup) => <SetupStatus key={setup.key} setup={setup} />)}
        <div>
          <h3 className="subhead">Open positions</h3>
          {rows.length === 0 ? <p className="empty">Nothing open.</p> : <ul className="positions">{rows.map((row) => <PositionRisk key={row.ticket} row={row} />)}</ul>}
        </div>
      </div>
    </section>
  );
}
