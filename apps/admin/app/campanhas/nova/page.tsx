import { AppShell } from "@/components/shell/AppShell";
import { DisparosShell } from "@/components/disparos/DisparosShell";
import { CampaignNew } from "@/components/disparos/CampaignNew";

export const metadata = { title: "Novo disparo" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <AppShell><DisparosShell><CampaignNew /></DisparosShell></AppShell>;
}
