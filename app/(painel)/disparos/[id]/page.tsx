import CampaignDetail from "@/components/CampaignDetail";
import { requirePage } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function DisparoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePage();
  const id = Number((await params).id);
  return <CampaignDetail id={id} role={session?.user.role || "atendente"} />;
}
