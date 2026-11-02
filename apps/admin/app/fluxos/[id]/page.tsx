import { AppShell } from "@/components/shell/AppShell";
import { DisparosShell } from "@/components/disparos/DisparosShell";
import { FlowEditor } from "@/components/disparos/flow-editor/FlowEditor";

export const metadata = { title: "Editor de fluxo" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell><DisparosShell full><FlowEditor flowId={id} /></DisparosShell></AppShell>;
}
