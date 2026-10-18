import { CalendarPanel } from "@/components/CalendarPanel";
import { PageHeader } from "@/components/Overview";
import { PnlChart } from "@/components/PnlChart";
import { TradesPanel } from "@/components/TradesPanel";
import { loadDashboard } from "@/lib/load";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const view = await loadDashboard();

  return (
    <main className="page">
      <PageHeader title="Trades" view={view} />
      <div className="grid-12">
        <section className="panel" aria-labelledby="cal-title">
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
      </div>
    </main>
  );
}
