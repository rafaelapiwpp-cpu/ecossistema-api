import "./conexoes.css";
import Connections from "@/components/Connections";
import { requirePage } from "@/lib/guard";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Conexões com a Meta: uma por BM, cada uma com o seu token (o Master decide quem vê cada BM). */
export default async function ConexoesPage() {
  await requirePage({ manager: true });
  if (!hasDb()) return <div className="banner"><b>Modo demonstração.</b> As conexões precisam do banco de dados conectado.</div>;
  return <Connections />;
}
