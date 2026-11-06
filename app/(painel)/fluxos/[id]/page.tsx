import FlowEditor from "@/components/flow/FlowEditor";
import { requirePage } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function FluxoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePage();
  const id = Number((await params).id);
  return <FlowEditor id={id} role={session?.user.role || "atendente"} />;
}
