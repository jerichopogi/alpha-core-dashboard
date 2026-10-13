import { getStore } from "./store";
import { buildView, type DashboardView } from "./view";

/** Reads the stored reports and shapes them for the dashboard as of now. */
export async function loadDashboard(): Promise<DashboardView> {
  return buildView(await getStore().load(), Math.floor(Date.now() / 1000));
}
