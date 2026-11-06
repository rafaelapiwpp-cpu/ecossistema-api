import "@/app/(painel)/atendimento/atendimento.css";
import Inbox from "@/components/Inbox";
import FocusNav from "@/components/flow/FocusNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atendimento" };

/** Atendimento do portal: a mesma tela do HUB, já restrita (pela API) aos números e à empresa do usuário. */
export default async function PortalAtendimento() {
  return <div className="at-page"><FocusNav /><Inbox /></div>;
}
