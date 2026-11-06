import Flows from "@/components/Flows";
import { requirePage } from "@/lib/guard";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function FluxosPage() {
  await requirePage();
  return hasDb() ? <Flows /> : <div className="banner"><b>Modo demonstração.</b> Os fluxos precisam do banco de dados conectado.</div>;
}
