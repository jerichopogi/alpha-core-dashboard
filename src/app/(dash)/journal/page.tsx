import { PageHeader } from "@/components/Overview";
import { MoneyInAndOut, SignalLog } from "@/components/Records";
import { loadDashboard } from "@/lib/load";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const view = await loadDashboard();

  return (
    <main className="page">
      <PageHeader title="Journal" view={view} />
      <div className="grid-12">
        <SignalLog view={view} />
        <MoneyInAndOut view={view} />
      </div>
    </main>
  );
}
