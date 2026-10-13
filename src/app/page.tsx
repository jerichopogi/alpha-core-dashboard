import { AutoRefresh } from "@/components/AutoRefresh";
import { CalendarPanel } from "@/components/CalendarPanel";
import { EdgeChart } from "@/components/EdgeChart";
import { PnlChart } from "@/components/PnlChart";
import { TradesPanel } from "@/components/TradesPanel";
import { loadDashboard } from "@/lib/load";
import type { DashboardView } from "@/lib/view";
import { logout } from "./login/actions";

export const dynamic = "force-dynamic";

const RATIO_METER_MAX = 2;
const STATUS_MARK = { running: "●", down: "▲", unknown: "○" } as const;

function Masthead({ view }: { view: DashboardView }) {
  return (
    <header className="masthead">
      <div>
        <p className="eyebrow">{view.market} · {view.account?.name ?? "no account yet"}</p>
        <h1 className="title">Alpha Core <em>ledger</em></h1>
      </div>
      <div className="masthead-side">
        <p className={`status status-${view.status.state}`}>
          <span className="status-mark" aria-hidden="true">{STATUS_MARK[view.status.state]}</span>
          {view.status.label}
        </p>
        <p className="muted">{view.status.detail}</p>
        <form action={logout}>
          <button type="submit" className="link-button">Sign out</button>
        </form>
      </div>
    </header>
  );
}

function AccountBlock({ view }: { view: DashboardView }) {
  const { account, ea } = view;
  if (!account) return null;

  return (
    <section className="account" aria-label="Account">
      <div className="balance">
        <p className="eyebrow">Balance</p>
        <p className="figure">{account.balance}</p>
        <p className="muted">Equity {account.equity} · Net deposited {account.deposits}</p>
      </div>

      <dl className="split">
        <div>
          <dt>Trading result, all time</dt>
          <dd className={`outcome-${account.totalOutcome}`}>{account.total}</dd>
        </div>
        <div>
          <dt><span className="tag tag-ea">EA</span> closed trades</dt>
          <dd className={`outcome-${account.eaOutcome}`}>{account.ea}</dd>
        </div>
        <div>
          <dt><span className="tag tag-manual">Manual</span> closed trades</dt>
          <dd className={`outcome-${account.manualOutcome}`}>{account.manual}</dd>
        </div>
      </dl>

      {ea ? <EaCard ea={ea} /> : (
        <div className="ea-card">
          <p className="eyebrow">EA right now</p>
          <p className="muted ea-waiting">
            The EA&apos;s risk, losses today and volatility ratio appear here after its first report from the VPS.
          </p>
        </div>
      )}
    </section>
  );
}

function EaCard({ ea }: { ea: NonNullable<DashboardView["ea"]> }) {
  const meterPosition = (value: number) => `${Math.min(1, value / RATIO_METER_MAX) * 100}%`;
  const passes = ea.ratio >= ea.ratioMin;

  return (
      <div className="ea-card">
        <p className="eyebrow">EA right now</p>
        <dl className="ea-facts">
          <div><dt>Risk</dt><dd>{ea.risk} ({ea.riskMoney})</dd></div>
          <div><dt>Losses today</dt><dd>{ea.lossesToday} of 2</dd></div>
        </dl>
        <div className="meter-block">
          <div className="meter-head">
            <span>Volatility ratio</span>
            <strong>{ea.ratio.toFixed(2)}</strong>
          </div>
          <div className="meter" role="img" aria-label={`Volatility ratio ${ea.ratio.toFixed(2)}, needs ${ea.ratioMin} to trade`}>
            <span className="meter-fill" style={{ width: meterPosition(ea.ratio) }} />
            <span className="meter-threshold" style={{ left: meterPosition(ea.ratioMin) }} />
          </div>
          <p className="muted">
            {!ea.filterOn
              ? "Filter is off: every cross is traded."
              : passes
                ? `Above ${ea.ratioMin}: a cross now would be traded.`
                : `Below ${ea.ratioMin}: a cross now would be skipped.`}
          </p>
        </div>
      </div>
  );
}

function OpenPositions({ view }: { view: DashboardView }) {
  return (
    <section className="section">
      <h2 className="section-title">Open positions</h2>
      {view.positions.length === 0 ? (
        <p className="empty">Nothing open.</p>
      ) : (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Opened</th><th>Source</th><th>Side</th><th className="num">Lots</th><th className="num">Entry</th>
                <th className="num">Stop</th><th className="num">Target</th><th className="num">Now</th><th className="num">Profit</th>
              </tr>
            </thead>
            <tbody>
              {view.positions.map((p) => (
                <tr key={p.ticket}>
                  <td>{p.opened}</td>
                  <td><span className={`tag tag-${p.source}`}>{p.source === "ea" ? "EA" : "Manual"}</span></td>
                  <td className="side">{p.side}</td>
                  <td className="num">{p.volume}</td>
                  <td className="num">{p.entry}</td>
                  <td className="num">{p.sl}</td>
                  <td className="num">{p.tp}</td>
                  <td className="num">{p.current}</td>
                  <td className={`num outcome-${p.outcome}`}>{p.profit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const CASH_LABEL = { deposit: "Deposit", withdrawal: "Withdrawal", adjustment: "Broker adjustment" } as const;

function MoneyInAndOut({ view }: { view: DashboardView }) {
  const { cash } = view;
  if (!cash.hasMoves) return null;
  return (
    <section className="section">
      <h2 className="section-title">Money in and out</h2>
      <p className="lede">{cash.summary}</p>
      <div className="equation" role="group" aria-label="How the balance adds up">
        <div><span className="eq-label">Deposited</span><span className="eq-value">{cash.deposited}</span></div>
        <span className="eq-op" aria-hidden="true">−</span>
        <div><span className="eq-label">Withdrawn</span><span className="eq-value">{cash.withdrawn}</span></div>
        {cash.adjustments && (
          <>
            <span className="eq-op" aria-hidden="true">+</span>
            <div><span className="eq-label">Broker adjustments</span><span className="eq-value">{cash.adjustments}</span></div>
          </>
        )}
        <span className="eq-op" aria-hidden="true">=</span>
        <div><span className="eq-label">Your money still in</span><span className="eq-value">{cash.net}</span></div>
        <span className="eq-op" aria-hidden="true">→</span>
        <div><span className="eq-label">Balance now</span><span className="eq-value">{cash.balance}</span></div>
        <div className="eq-result">
          <span className="eq-label">Real trading result</span>
          <span className={`eq-value outcome-${cash.resultOutcome}`}>{cash.result}</span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="ledger">
          <thead>
            <tr><th>When</th><th>Type</th><th className="num">Amount</th><th>Broker note</th></tr>
          </thead>
          <tbody>
            {cash.rows.map((row) => (
              <tr key={row.ticket}>
                <td>{row.time}</td>
                <td>{CASH_LABEL[row.kind]}</td>
                <td className="num">{row.amount}</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LiveVsBacktest({ view }: { view: DashboardView }) {
  return (
    <section className="section">
      <h2 className="section-title">Live against the backtest</h2>
      <p className="lede">{view.verdict}</p>
      <div className="two-up">
        <EdgeChart live={view.edge.live} expected={view.edge.expected} />
        <table className="ledger compare">
          <thead>
            <tr><th>EA trades</th><th className="num">Live</th><th className="num">Backtest</th></tr>
          </thead>
          <tbody>
            {view.benchmark.map((row) => (
              <tr key={row.metric}>
                <td>{row.metric}</td>
                <td className="num strong">{row.live}</td>
                <td className="num">{row.backtest}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="footnote">
        Backtest: 438 trades, 2021 to October 2026, costs included. It was the best of many settings tried, so the real edge is
        probably smaller, around half.
      </p>
    </section>
  );
}

function SignalLog({ view }: { view: DashboardView }) {
  const { total, traded } = view.signalCounts;
  return (
    <section className="section">
      <h2 className="section-title">Signal log</h2>
      <p className="lede">
        {total === 0
          ? "No EMA crosses recorded yet. Each one appears here with the EA's decision."
          : `${total} EMA crosses seen, ${traded} traded, ${total - traded} skipped.`}
      </p>
      {view.signals.length > 0 && (
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr><th>Candle closed</th><th>Signal</th><th className="num">Close</th><th className="num">Ratio</th><th>Decision</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {view.signals.map((s) => (
                <tr key={s.key}>
                  <td>{s.time}</td>
                  <td className="side">{s.dir}</td>
                  <td className="num">{s.close}</td>
                  <td className="num">{s.ratio}</td>
                  <td><span className={`decision decision-${s.action}`}>{s.action === "traded" ? "✓ Traded" : "– Skipped"}</span></td>
                  <td>{s.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const view = await loadDashboard();

  return (
    <main className="page">
      <AutoRefresh />
      <Masthead view={view} />
      {!view.hasData && (
        <p className="notice">
          No report has arrived yet. Once the EA is updated with the dashboard address and token, the first report shows up
          within five minutes.
        </p>
      )}
      <AccountBlock view={view} />
      <OpenPositions view={view} />
      <section className="section">
        <h2 className="section-title">Calendar</h2>
        <p className="lede">Profit and loss from closed trades, by the Philippine day they closed.</p>
        <CalendarPanel {...view.calendar} />
      </section>
      <LiveVsBacktest view={view} />
      <section className="section">
        <h2 className="section-title">Closed trades</h2>
        <PnlChart {...view.pnl} />
        <TradesPanel rows={view.tradeRows} stats={view.stats} />
      </section>
      <SignalLog view={view} />
      <MoneyInAndOut view={view} />
      <footer className="footer">Times are Philippine time. Figures refresh every minute; the EA reports every five.</footer>
    </main>
  );
}
