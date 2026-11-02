import Link from "next/link";
import { buttonClass, Cell2, ConfirmAction, DataTable, EmptyState, Meter, Page, PageHeader, RowActions, StatusBadge, type Column } from "@eco/ui";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { formatInt } from "@/lib/format";
import { deleteNumero } from "./actions";

export const metadata = { title: "Números" };
export const dynamic = "force-dynamic";

async function load() {
  return prisma.numero.findMany({
    orderBy: { criadoEm: "desc" },
    include: { bm: { select: { nome: true } } },
  });
}
type Row = Awaited<ReturnType<typeof load>>[number];

const columns: Column<Row>[] = [
  { id: "telefone", header: "Número", cell: (n) => <Cell2 primary={<span className="eco-num">{n.telefone}</span>} secondary={n.metaPhoneId ?? undefined} mono /> },
  { id: "bm", header: "BM", kind: "secondary", cell: (n) => n.bm?.nome ?? "—" },
  { id: "status", header: "Status", cell: (n) => <StatusBadge domain="contingencyNumber" value={n.status} size="sm" /> },
  { id: "qualidade", header: "Qualidade", cell: (n) => <StatusBadge domain="contingencyQuality" value={n.qualidade} size="sm" /> },
  {
    id: "uso",
    header: "Uso hoje",
    cell: (n) =>
      n.limiteDiario > 0 ? (
        <span className="eco-usage-cell">
          <span>
            {formatInt(n.enviadasHoje)} <span className="eco-muted">/ {formatInt(n.limiteDiario)}</span>
          </span>
          <Meter value={n.enviadasHoje} max={n.limiteDiario} label={`Uso do limite de ${n.telefone}`} />
        </span>
      ) : (
        <span className="eco-num">{formatInt(n.enviadasHoje)}</span>
      ),
  },
  {
    id: "acoes",
    header: "",
    kind: "actions",
    cell: (n) => (
      <RowActions>
        <Link href={`/numeros/${n.id}`} className={buttonClass({ variant: "ghost", size: "sm" })}>
          Editar
        </Link>
        <ConfirmAction action={deleteNumero} fields={{ id: n.id }} target={n.telefone} />
      </RowActions>
    ),
  },
];

export default async function NumerosPage() {
  const numeros = await load();

  return (
    <AppShell>
      <Page>
        <PageHeader
          title="Números"
          subtitle={numeros.length === 1 ? "1 número cadastrado" : `${formatInt(numeros.length)} números cadastrados`}
          actions={
            <Link href="/numeros/novo" className={buttonClass({ variant: "primary" })}>
              <Icon name="phone" size={16} /> Novo número
            </Link>
          }
        />
        <DataTable
          caption="Números de WhatsApp"
          columns={columns}
          rows={numeros}
          rowKey={(n) => n.id}
          empty={
            <EmptyState
              icon={<Icon name="phone" size={20} />}
              title="Nenhum número cadastrado"
              action={
                <Link href="/numeros/novo" className={buttonClass({ variant: "primary" })}>
                  Cadastrar número
                </Link>
              }
            >
              Cadastre os números de WhatsApp de cada BM para acompanhar status, qualidade e uso.
            </EmptyState>
          }
        />
      </Page>
    </AppShell>
  );
}
