import Link from "next/link";
import { buttonClass, Cell2, ConfirmAction, DataTable, EmptyState, Page, PageHeader, RowActions, StatusBadge, type Column } from "@eco/ui";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { nivelLabel } from "@/lib/contingencia";
import { formatInt } from "@/lib/format";
import { deleteBm } from "./actions";

export const metadata = { title: "Business Managers" };
export const dynamic = "force-dynamic";

async function load() {
  return prisma.bm.findMany({
    orderBy: { criadoEm: "desc" },
    include: { cliente: { select: { nome: true } }, _count: { select: { numeros: true } } },
  });
}
type Row = Awaited<ReturnType<typeof load>>[number];

const columns: Column<Row>[] = [
  { id: "bm", header: "BM", cell: (bm) => <Cell2 primary={bm.nome} secondary={bm.metaBmId ?? undefined} mono /> },
  { id: "cliente", header: "Cliente", kind: "secondary", cell: (bm) => bm.cliente?.nome ?? "—" },
  { id: "status", header: "Status", cell: (bm) => <StatusBadge domain="contingencyBm" value={bm.status} size="sm" /> },
  { id: "verificacao", header: "Verificação", cell: (bm) => <StatusBadge domain="contingencyBmVerification" value={bm.verificacao} size="sm" /> },
  { id: "limite", header: "Limite 24 h", align: "right", cell: (bm) => nivelLabel(bm.nivelLimite) },
  { id: "numeros", header: "Números", align: "right", cell: (bm) => formatInt(bm._count.numeros) },
  {
    id: "acoes",
    header: "",
    kind: "actions",
    cell: (bm) => (
      <RowActions>
        <Link href={`/bms/${bm.id}`} className={buttonClass({ variant: "ghost", size: "sm" })}>
          Editar
        </Link>
        <ConfirmAction action={deleteBm} fields={{ id: bm.id }} target={bm.nome} />
      </RowActions>
    ),
  },
];

export default async function BmsPage() {
  const bms = await load();

  return (
    <AppShell>
      <Page>
        <PageHeader
          title="Business Managers"
          subtitle={bms.length === 1 ? "1 BM cadastrada" : `${formatInt(bms.length)} BMs cadastradas`}
          actions={
            <Link href="/bms/novo" className={buttonClass({ variant: "primary" })}>
              <Icon name="businessManager" size={16} /> Nova BM
            </Link>
          }
        />
        <DataTable
          caption="Business Managers"
          columns={columns}
          rows={bms}
          rowKey={(bm) => bm.id}
          empty={
            <EmptyState
              icon={<Icon name="businessManager" size={20} />}
              title="Nenhuma BM cadastrada"
              action={
                <Link href="/bms/novo" className={buttonClass({ variant: "primary" })}>
                  Cadastrar BM
                </Link>
              }
            >
              Cadastre o portfólio de cada cliente para acompanhar limite, verificação e números.
            </EmptyState>
          }
        />
      </Page>
    </AppShell>
  );
}
