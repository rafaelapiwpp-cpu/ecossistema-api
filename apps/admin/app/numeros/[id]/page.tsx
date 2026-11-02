import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { NumeroForm } from "../NumeroForm";
import { deleteNumero } from "../actions";
import s from "@/components/ui/crud.module.css";

export const metadata = { title: "Editar número" };
export const dynamic = "force-dynamic";

export default async function EditarNumeroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [numero, bms] = await Promise.all([
    prisma.numero.findUnique({ where: { id } }),
    prisma.bm.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  if (!numero) notFound();

  return (
    <AppShell>
      <div className={s.page}>
        <div className={s.header}>
          <div>
            <Link href="/numeros" className={s.link}><Icon name="arrowUp" size={13} style={{ transform: "rotate(-90deg)" }} /> Números</Link>
            <h1 className={s.title} style={{ marginTop: 4 }}>{numero.telefone}</h1>
          </div>
          <form action={deleteNumero}>
            <input type="hidden" name="id" value={numero.id} />
            <button type="submit" className={`${s.btn} ${s.btnDanger}`}>
              <Icon name="x" size={15} /> Excluir
            </button>
          </form>
        </div>
        <div className={s.panel}>
          <NumeroForm
            bms={bms}
            numero={{
              id: numero.id,
              telefone: numero.telefone,
              bmId: numero.bmId,
              status: numero.status,
              qualidade: numero.qualidade,
              limiteDiario: numero.limiteDiario,
              enviadasHoje: numero.enviadasHoje,
              metaPhoneId: numero.metaPhoneId,
              notas: numero.notas,
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
