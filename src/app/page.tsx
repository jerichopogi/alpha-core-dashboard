import { AutoRefresh } from "@/components/AutoRefresh";
import { CalendarPanel } from "@/components/CalendarPanel";
import { EdgeChart } from "@/components/EdgeChart";
import { PnlChart } from "@/components/PnlChart";
import { TradesPanel } from "@/components/TradesPanel";
import { loadDashboard } from "@/lib/load";
import type { DashboardView, SetupView } from "@/lib/view";
import { logout } from "./login/actions";

export const dynamic = "force-dynamic";

const RATIO_METER_MAX = 2;
const STATUS_MARK = { running: "●", down: "▲" } as const;
const CASH_LABEL = { deposit: "Deposit", withdrawal: "Withdrawal", adjustment: "Broker adjustment" } as const;

function Masthead({ view }: { view: DashboardView }) {
  return (
    <header className="masthead">
      <div>
        <p className="eyebrow">XAUUSD · {view.account?.name ?? "no account yet"}</p>
        <h1 className="title">Alpha Core <em>ledger</em></h1>
      </div>
      <div className="masthead-side">
        {view.setups.length === 0 ? (
          <p className="status status-unknown">
            <span className="status-mark" aria-hidden="true">○</span>Waiting for the EA&apos;s first report
          </p>
        ) : (
          <ul className="status-list" aria-label="EA setups">
            {view.setups.map((setup) => (
              <li key={setup.key} className={`status status-${setup.status.state}`} title={setup.status.detail}>
                <span className="status-mark" aria-hidden="true">{STATUS_MARK[setup.status.state]}</span>
                <span className="status-name">{setup.label}</span>
                {setup.status.label}
              </li>
            ))}
          </ul>
        )}
        <p className="muted">{view.accountDetail}</p>
        <form action={logout}>
          <button type="submit" className="link-button">Sign out</button>
        </form>
      </div>
    </header>
  );
}

function SetupCard({ setup }: { setup: SetupView }) {
  const meterPosition = (value: number) => `${Math.min(1, value / RATIO_METER_MAX) * 100}%`;
  const passes = setup.ratio >= setup.ratioMin;

  return (
    <div className="ea-card">
      <div className="ea-card-head">
        <p className="eyebrow"><span className={`tag tag-c${setup.color}`}>{setup.label}</span> {setup.market}</p>
        <p className={`muted outcome-${setup.status.state === "running" ? "win" : "loss"}`}>{setup.status.label}</p>
      </div>
      <dl className="ea-facts">
        <div><dt>Risk</dt><dd>{setup.risk} ({setup.riskMoney})</dd></div>
        <div><dt>Losses today</dt><dd>{setup.lossesToday} of 2</dd></div>
      </dl>
      <div className="meter-block">
        <div className="meter-head">
          <span>Volatility ratio</span>
          <strong>{setup.ratio.toFixed(2)}</strong>
        </div>
        <div className="meter" role="img" aria-label={`Volatility ratio ${setup.ratio.toFixed(2)}, needs ${setup.ratioMin} to trade`}>
          <span className="meter-fill" style={{ width: meterPosition(setup.ratio) }} />
          <span className="meter-threshold" style={{ left: meterPosition(setup.ratioMin) }} />
        </div>
        <p className="muted">
          {!setup.filterOn
            ? "Filter is off: every cross is considered."
            : passes
              ? `Above ${setup.ratioMin}: a cross now passes the volatility filter.`
              : `Below ${setup.ratioMin}: a cross now would be skipped.`}
        </p>
      </div>
    </div>
  );
}

function AccountBlock({ view }: { view: DashboardView }) {
  const { account, setups } = view;
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
        {setups.map((setup) => (
          <div key={setup.key}>
            <dt><span className={`tag tag-c${setup.color}`}>{setup.label}</span> closed trades</dt>
            <dd className={`outcome-${setup.netOutcome}`}>{setup.net}</dd>
          </div>
        ))}
        <div>
          <dt><span className="tag tag-c2">Manual</span> closed trades</dt>
          <dd className={`outcome-${account.manualOutcome}`}>{account.manual}</dd>
        </div>
      </dl>

      <div className="ea-cards">
        {setups.length === 0 ? (
          <div className="ea-card">
            <p className="eyebrow">EA right now</p>
            <p className="muted ea-waiting">
              Each setup&apos;s risk, losses today and volatility ratio appear here after its first report from the VPS.
            </p>
          </div>
        ) : (
          setups.map((setup) => <SetupCard key={setup.key} setup={setup} />)
        )}
      </div>
    </section>
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
                  <td><span className={`tag tag-c${p.group.color}`}>{p.group.label}</span></td>
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

function LiveVsBacktest({ view }: { view: DashboardView }) {
  const compared = view.setups.filter((setup) => setup.comparison !== null);
  return (
    <section className="section">
      <h2 className="section-title">Live against the backtest</h2>
      {compared.length === 0 && <p className="empty">Each setup is compared with its own backtest here once it has reported.</p>}
      {compared.map((setup) => {
        const comparison = setup.comparison;
        if (!comparison) return null;
        return (
          <div key={setup.key} className="setup-compare">
            <h3 className="setup-title"><span className={`tag tag-c${setup.color}`}>{setup.label}</span> {setup.market}</h3>
            <p className="lede">{comparison.verdict}</p>
            <div className="two-up">
              <EdgeChart live={comparison.live} expected={comparison.expected} color={setup.color} />
              <table className="ledger compare">
                <thead>
                  <tr><th>{setup.label}</th><th className="num">Live</th><th className="num">Backtest</th></tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.metric}>
                      <td>{row.metric}</td>
                      <td className="num strong">{row.live}</td>
                      <td className="num">{row.backtest}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="footnote">Backtest, 2021 to October 2026, costs included. {comparison.description}</p>
          </div>
        );
      })}
      {compared.length > 0 && (
        <p className="footnote">Each setup was the best of many settings tried, so the real edge is probably smaller than its backtest.</p>
      )}
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
              <tr>
                <th>Candle closed</th><th>Setup</th><th>Signal</th><th className="num">Close</th><th className="num">Ratio</th><th>Decision</th><th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {view.signals.map((s) => (
                <tr key={s.key}>
                  <td>{s.time}</td>
                  <td><span className={`tag tag-c${s.color}`}>{s.setup}</span></td>
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
        <TradesPanel groups={view.groups} rows={view.tradeRows} stats={view.stats} />
      </section>
      <SignalLog view={view} />
      <MoneyInAndOut view={view} />
      <footer className="footer">Times are Philippine time. Figures refresh every minute; each setup reports every five.</footer>
    </main>
  );
}
