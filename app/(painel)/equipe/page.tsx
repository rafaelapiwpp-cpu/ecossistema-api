import Team from "@/components/Team";
import { requirePage } from "@/lib/guard";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  await requirePage();
  return (
    <>
      <div className="topbar"><div className="title"><h1>Equipe</h1><p>Usuários, departamentos, tags, listas e respostas rápidas</p></div></div>
      {hasDb() ? <Team /> : <div className="banner"><b>Modo demonstração.</b> A equipe precisa do banco de dados conectado.</div>}
    </>
  );
}
