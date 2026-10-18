import { EquityChart } from "@/components/EquityChart";
import { PageHeader } from "@/components/Overview";
import { PerformancePanel } from "@/components/PerformancePanel";
import { BacktestPanel } from "@/components/Records";
import { loadDashboard } from "@/lib/load";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const view = await loadDashboard();
  const { insights } = view;

  return (
    <main className="page">
      <PageHeader title="Analytics" view={view} />
      <div className="grid-12">
        {insights ? <PerformancePanel views={insights.performance} /> : <p className="empty">Analytics appear with the first report.</p>}
        <section className="panel" aria-labelledby="dd-title">
          <div className="panel-head">
            <h2 id="dd-title" className="panel-title">Drawdown</h2>
            <span className="panel-meta">Time-weighted, restarts after the account is emptied</span>
          </div>
          <div className="panel-body">
            {insights ? <EquityChart data={insights.chart} mode="drawdown" /> : <p className="empty">No data yet.</p>}
          </div>
        </section>
        <BacktestPanel view={view} />
      </div>
    </main>
  );
}
