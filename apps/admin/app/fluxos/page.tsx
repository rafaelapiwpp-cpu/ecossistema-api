import { AppShell } from "@/components/shell/AppShell";
import { DisparosShell } from "@/components/disparos/DisparosShell";
import { FlowsList } from "@/components/disparos/FlowsList";

export const metadata = { title: "Fluxos de automação" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <AppShell><DisparosShell><FlowsList /></DisparosShell></AppShell>;
}
