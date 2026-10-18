import { EquityChart } from "@/components/EquityChart";
import { EaCard, KpiCards, ObjectivesCard, PageHeader, PositionsCard, RecentTrades } from "@/components/Overview";
import { loadDashboard } from "@/lib/load";

export const dynamic = "force-dynamic";

const OVERVIEW_KPIS = ["balance", "equity", "today", "result"];

export default async function OverviewPage() {
  const view = await loadDashboard();
  const { insights } = view;

  return (
    <main className="page">
      <PageHeader title="Overview" view={view} />
      {!view.hasData && (
        <p className="notice">No report has arrived yet. Once the EA has the dashboard address and token, the first report shows up within five minutes.</p>
      )}
      {insights && <KpiCards kpis={insights.kpis.filter((k) => OVERVIEW_KPIS.includes(k.key))} />}
      <div className="grid-12">
        <section className="panel span-8" aria-labelledby="growth-title">
          <div className="panel-head">
            <h2 id="growth-title" className="panel-title">Account growth</h2>
          </div>
          <div className="panel-body">
            {insights ? <EquityChart data={insights.chart} /> : <p className="empty">The curve appears with the first report.</p>}
          </div>
        </section>
        {insights && <ObjectivesCard objectives={insights.objectives} />}
        <EaCard view={view} />
        <PositionsCard rows={insights?.riskRows ?? []} openRisk={insights?.openRisk ?? "$0.00"} />
        <RecentTrades rows={view.tradeRows} />
      </div>
    </main>
  );
}
