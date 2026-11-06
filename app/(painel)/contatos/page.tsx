import Contacts from "@/components/Contacts";
import { requirePage } from "@/lib/guard";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ContatosPage() {
  await requirePage();
  return (
    <>
      <div className="topbar"><div className="title"><h1>Contatos</h1><p>Leads e clientes das suas contas, com tags, listas e campos personalizados</p></div></div>
      {hasDb() ? <Contacts /> : <div className="banner"><b>Modo demonstração.</b> Os contatos precisam do banco de dados conectado.</div>}
    </>
  );
}
