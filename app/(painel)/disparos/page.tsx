import Campaigns from "@/components/Campaigns";
import { requirePage } from "@/lib/guard";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DisparosPage() {
  await requirePage();
  return (
    <>
      <div className="topbar"><div className="title"><h1>Disparos</h1><p>Campanhas de template para listas, tags ou números avulsos, com acompanhamento em tempo real</p></div></div>
      {hasDb() ? <Campaigns /> : <div className="banner"><b>Modo demonstração.</b> Os disparos precisam do banco de dados conectado.</div>}
    </>
  );
}
