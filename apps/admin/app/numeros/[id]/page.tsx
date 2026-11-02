import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLabel, ConfirmAction, Page, PageHeader } from "@eco/ui";
import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/lib/db";
import { NumeroForm } from "../NumeroForm";
import { deleteNumero } from "../actions";

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
      <Page narrow>
        <PageHeader
          title={<span className="eco-num">{numero.telefone}</span>}
          back={
            <Link href="/numeros" className="eco-back">
              <BackLabel>Números</BackLabel>
            </Link>
          }
          actions={
            <ConfirmAction action={deleteNumero} fields={{ id: numero.id }} target={numero.telefone} label="Excluir número" confirmLabel="Excluir" look="button" size="md" />
          }
        />
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
      </Page>
    </AppShell>
  );
}
