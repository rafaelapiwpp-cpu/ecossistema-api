import { getAdminOverview, getDataSource } from "@eco/core";
import { AppShell } from "@/components/shell/AppShell";
import { OverviewScreen } from "@/components/overview/OverviewScreen";

export const metadata = { title: "Visão geral" };

/** Sempre renderizado no request: quando o Postgres entrar, os dados mudam a cada acesso. */
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const data = await getAdminOverview(getDataSource());
  return (
    <AppShell>
      <OverviewScreen data={data} />
    </AppShell>
  );
}
