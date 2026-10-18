import type { DashboardView } from "@/lib/view";
import { EdgeChart } from "./EdgeChart";

const CASH_LABEL = { deposit: "Deposit", withdrawal: "Withdrawal", adjustment: "Broker adjustment" } as const;

export function BacktestPanel({ view }: { view: DashboardView }) {
  const compared = view.setups.filter((setup) => setup.comparison !== null);
  return (
    <section className="panel span-6" aria-labelledby="bt-title">
      <div className="panel-head">
        <h2 id="bt-title" className="panel-title">Live vs backtest</h2>
        <span className="panel-meta">Cumulative R</span>
      </div>
      <div className="panel-body">
        {compared.length === 0 && <p className="empty">Each setup is compared with its own backtest once it has reported.</p>}
        {compared.map((setup) => {
          const comparison = setup.comparison;
          if (!comparison) return null;
          return (
            <div key={setup.key} className="compare-block">
              <p className="lede"><span className={`tag tag-c${setup.color}`}>{setup.label}</span> {comparison.verdict}</p>
              <EdgeChart live={comparison.live} expected={comparison.expected} color={setup.color} />
              <table className="ledger">
                <thead><tr><th>{setup.label}</th><th className="num">Live</th><th className="num">Backtest</th></tr></thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.metric}><td>{row.metric}</td><td className="num strong">{row.live}</td><td className="num">{row.backtest}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="footnote">{comparison.description} Picked from many settings, so the real edge is probably smaller.</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SignalLog({ view }: { view: DashboardView }) {
  const { total, traded } = view.signalCounts;
  return (
    <section className="panel span-7" aria-labelledby="sig-title">
      <div className="panel-head">
        <h2 id="sig-title" className="panel-title">Signal log</h2>
        <span className="panel-meta">{total === 0 ? "No crosses yet" : `${total} crosses · ${traded} traded · ${total - traded} skipped`}</span>
      </div>
      {view.signals.length === 0 ? (
        <div className="panel-body"><p className="empty">Each EMA cross appears here with the EA&apos;s decision.</p></div>
      ) : (
        <div className="table-scroll scroll-y">
          <table className="ledger">
            <thead>
              <tr><th>Candle closed</th><th>Setup</th><th>Signal</th><th className="num">Close</th><th className="num">Ratio</th><th>Decision</th><th>Detail</th></tr>
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

export function MoneyInAndOut({ view }: { view: DashboardView }) {
  const { cash } = view;
  return (
    <section className="panel span-5" aria-labelledby="cash-title">
      <div className="panel-head">
        <h2 id="cash-title" className="panel-title">Money in and out</h2>
      </div>
      <div className="panel-body">
        {!cash.hasMoves ? (
          <p className="empty">No deposits or withdrawals recorded.</p>
        ) : (
          <>
            <p className="lede">{cash.summary}</p>
            <div className="equation" role="group" aria-label="How the balance adds up">
              <div><span className="eq-label">Deposited</span><span className="eq-value">{cash.deposited}</span></div>
              <span className="eq-op" aria-hidden="true">−</span>
              <div><span className="eq-label">Withdrawn</span><span className="eq-value">{cash.withdrawn}</span></div>
              {cash.adjustments && (
                <>
                  <span className="eq-op" aria-hidden="true">+</span>
                  <div><span className="eq-label">Adjustments</span><span className="eq-value">{cash.adjustments}</span></div>
                </>
              )}
              <span className="eq-op" aria-hidden="true">=</span>
              <div><span className="eq-label">Still in</span><span className="eq-value">{cash.net}</span></div>
              <div className="eq-result">
                <span className="eq-label">Trading result</span>
                <span className={`eq-value outcome-${cash.resultOutcome}`}>{cash.result}</span>
              </div>
            </div>
            <div className="table-scroll scroll-y">
              <table className="ledger">
                <thead><tr><th>When</th><th>Type</th><th className="num">Amount</th><th>Broker note</th></tr></thead>
                <tbody>
                  {cash.rows.map((row) => (
                    <tr key={row.ticket}><td>{row.time}</td><td>{CASH_LABEL[row.kind]}</td><td className="num">{row.amount}</td><td>{row.note}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
