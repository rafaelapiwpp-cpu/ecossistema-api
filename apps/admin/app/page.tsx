import { getAdminOverview } from "@eco/core";
import { AppShell } from "@/components/shell/AppShell";
import { OverviewScreen } from "@/components/overview/OverviewScreen";
import { getDataSource } from "@/lib/datasource";

export const metadata = { title: "Visão geral" };

/** Sempre renderizado no request: os dados vêm do Neon a cada acesso. */
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const data = await getAdminOverview(getDataSource());
  return (
    <AppShell>
      <OverviewScreen data={data} />
    </AppShell>
  );
}
