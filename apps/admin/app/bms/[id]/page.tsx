import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { BmForm } from "../BmForm";
import { deleteBm } from "../actions";
import s from "@/components/ui/crud.module.css";

export const metadata = { title: "Editar BM" };
export const dynamic = "force-dynamic";

export default async function EditarBmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [bm, clientes] = await Promise.all([
    prisma.bm.findUnique({ where: { id } }),
    prisma.cliente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  if (!bm) notFound();

  return (
    <AppShell>
      <div className={s.page}>
        <div className={s.header}>
          <div>
            <Link href="/bms" className={s.link}><Icon name="arrowUp" size={13} style={{ transform: "rotate(-90deg)" }} /> Business Managers</Link>
            <h1 className={s.title} style={{ marginTop: 4 }}>{bm.nome}</h1>
          </div>
          <form action={deleteBm}>
            <input type="hidden" name="id" value={bm.id} />
            <button type="submit" className={`${s.btn} ${s.btnDanger}`}>
              <Icon name="x" size={15} /> Excluir
            </button>
          </form>
        </div>
        <div className={s.panel}>
          <BmForm
            clientes={clientes}
            bm={{
              id: bm.id,
              nome: bm.nome,
              clienteId: bm.clienteId,
              status: bm.status,
              verificacao: bm.verificacao,
              nivelLimite: bm.nivelLimite,
              metaBmId: bm.metaBmId,
              notas: bm.notas,
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
