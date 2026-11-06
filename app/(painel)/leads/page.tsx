import Leads from "@/components/Leads";
import { requirePage } from "@/lib/guard";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  await requirePage();
  return (
    <>
      <div className="topbar"><div className="title"><h1>Leads</h1><p>Importe planilhas de leads em listas com tag própria e use nos disparos e fluxos</p></div></div>
      {hasDb() ? <Leads /> : <div className="banner"><b>Modo demonstração.</b> A importação de leads precisa do banco de dados conectado.</div>}
    </>
  );
}
