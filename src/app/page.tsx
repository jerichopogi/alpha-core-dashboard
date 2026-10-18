import { AutoRefresh } from "@/components/AutoRefresh";
import { CalendarPanel } from "@/components/CalendarPanel";
import { EquityChart } from "@/components/EquityChart";
import { KpiStrip, RiskPanel, TopBar } from "@/components/Overview";
import { PerformancePanel } from "@/components/PerformancePanel";
import { PnlChart } from "@/components/PnlChart";
import { BacktestPanel, MoneyInAndOut, SignalLog } from "@/components/Records";
import { TradesPanel } from "@/components/TradesPanel";
import { loadDashboard } from "@/lib/load";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const view = await loadDashboard();
  const { insights } = view;

  return (
    <main className="page">
      <AutoRefresh />
      <TopBar view={view} />
      <div className="dash">
        {!view.hasData && (
          <p className="notice">No report has arrived yet. Once the EA has the dashboard address and token, the first report shows up within five minutes.</p>
        )}
        {insights && <KpiStrip insights={insights} />}

        <section className="panel span-8" aria-labelledby="equity-title">
          <div className="panel-head">
            <h2 id="equity-title" className="panel-title">Equity and drawdown</h2>
          </div>
          <div className="panel-body">
            {insights ? <EquityChart data={insights.chart} /> : <p className="empty">The curve appears with the first report.</p>}
          </div>
        </section>
        <RiskPanel view={view} insights={insights} />

        {insights && <PerformancePanel views={insights.performance} />}

        <BacktestPanel view={view} />
        <section className="panel span-6" aria-labelledby="cal-title">
          <div className="panel-head">
            <h2 id="cal-title" className="panel-title">Calendar</h2>
            <span className="panel-meta">By the Philippine day trades closed</span>
          </div>
          <div className="panel-body">
            <CalendarPanel {...view.calendar} />
          </div>
        </section>

        <section className="panel" aria-labelledby="trades-title">
          <div className="panel-head">
            <h2 id="trades-title" className="panel-title">Closed trades</h2>
            <span className="panel-meta">Cumulative profit by who opened the trade</span>
          </div>
          <div className="panel-body">
            <PnlChart {...view.pnl} />
            <TradesPanel groups={view.groups} rows={view.tradeRows} />
          </div>
        </section>

        <SignalLog view={view} />
        <MoneyInAndOut view={view} />
      </div>
      <footer className="footer">Times are Philippine time · refreshes every minute · each setup reports every five</footer>
    </main>
  );
}
