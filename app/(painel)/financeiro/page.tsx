import Finance from "@/components/finance/Finance";
import { requirePage } from "@/lib/guard";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro" };

// Financeiro da operação: só o Master entra (os demais voltam para a Visão geral).
export default async function FinanceiroPage() {
  await requirePage({ master: true });
  if (!hasDb()) {
    return (
      <>
        <div className="topbar"><div className="title"><h1>Financeiro</h1><p>Lucro, metas e projeção da operação</p></div></div>
        <div className="banner"><b>Modo demonstração.</b> O financeiro precisa do banco de dados conectado.</div>
      </>
    );
  }
  return <Finance />;
}
