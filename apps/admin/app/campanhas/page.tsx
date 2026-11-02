import { AppShell } from "@/components/shell/AppShell";
import { DisparosShell } from "@/components/disparos/DisparosShell";
import { CampaignsList } from "@/components/disparos/CampaignsList";

export const metadata = { title: "Campanhas" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <AppShell><DisparosShell><CampaignsList /></DisparosShell></AppShell>;
}
