import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLabel, ConfirmAction, Page, PageHeader } from "@eco/ui";
import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/lib/db";
import { BmForm } from "../BmForm";
import { deleteBm } from "../actions";

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
      <Page narrow>
        <PageHeader
          title={bm.nome}
          back={
            <Link href="/bms" className="eco-back">
              <BackLabel>Business Managers</BackLabel>
            </Link>
          }
          actions={<ConfirmAction action={deleteBm} fields={{ id: bm.id }} target={bm.nome} label="Excluir BM" confirmLabel="Excluir" look="button" size="md" />}
        />
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
      </Page>
    </AppShell>
  );
}
