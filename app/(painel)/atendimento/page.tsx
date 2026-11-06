import "./atendimento.css";
import Inbox from "@/components/Inbox";
import FocusNav from "@/components/flow/FocusNav";
import { requirePage } from "@/lib/guard";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Atendimento ocupa a tela inteira: o menu do HUB vira a faixa de ícones enquanto você está aqui (como em Fluxos). */
export default async function Atendimento() {
  await requirePage();
  if (!hasDb()) return <div className="banner"><b>Modo demonstração.</b> O atendimento precisa do banco de dados conectado.</div>;
  return <div className="at-page"><FocusNav /><Inbox /></div>;
}
