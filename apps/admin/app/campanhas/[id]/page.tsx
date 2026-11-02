import { AppShell } from "@/components/shell/AppShell";
import { DisparosShell } from "@/components/disparos/DisparosShell";
import { CampaignDetail } from "@/components/disparos/CampaignDetail";

export const metadata = { title: "Campanha" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell><DisparosShell><CampaignDetail id={id} /></DisparosShell></AppShell>;
}
