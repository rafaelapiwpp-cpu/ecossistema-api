import Link from "next/link";
import { buttonClass, Cell2, ConfirmAction, DataTable, EmptyState, Page, PageHeader, RowActions, StatusBadge, Tag, type Column } from "@eco/ui";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { TEMPLATE_CATEGORIA_MAP } from "@/lib/contingencia";
import { formatInt } from "@/lib/format";
import { deleteTemplate } from "./actions";

export const metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

async function load() {
  return prisma.template.findMany({
    orderBy: { criadoEm: "desc" },
    include: { cliente: { select: { nome: true } } },
  });
}
type Row = Awaited<ReturnType<typeof load>>[number];

const columns: Column<Row>[] = [
  { id: "template", header: "Template", cell: (t) => <Cell2 primary={t.nome} secondary={t.corpo} /> },
  { id: "cliente", header: "Cliente", kind: "secondary", cell: (t) => t.cliente?.nome ?? "—" },
  { id: "categoria", header: "Categoria", kind: "secondary", cell: (t) => TEMPLATE_CATEGORIA_MAP[t.categoria] ?? t.categoria },
  { id: "status", header: "Status", cell: (t) => <StatusBadge domain="contingencyTemplate" value={t.status} size="sm" /> },
  { id: "idioma", header: "Idioma", cell: (t) => <Tag>{t.idioma}</Tag> },
  {
    id: "acoes",
    header: "",
    kind: "actions",
    cell: (t) => (
      <RowActions>
        <Link href={`/templates/${t.id}`} className={buttonClass({ variant: "ghost", size: "sm" })}>
          Editar
        </Link>
        <ConfirmAction action={deleteTemplate} fields={{ id: t.id }} target={t.nome} />
      </RowActions>
    ),
  },
];

export default async function TemplatesPage() {
  const templates = await load();

  return (
    <AppShell>
      <Page>
        <PageHeader
          title="Templates"
          subtitle={templates.length === 1 ? "1 template cadastrado" : `${formatInt(templates.length)} templates cadastrados`}
          actions={
            <Link href="/templates/novo" className={buttonClass({ variant: "primary" })}>
              <Icon name="template" size={16} /> Novo template
            </Link>
          }
        />
        <DataTable
          caption="Templates de mensagem"
          columns={columns}
          rows={templates}
          rowKey={(t) => t.id}
          empty={
            <EmptyState
              icon={<Icon name="template" size={20} />}
              title="Nenhum template cadastrado"
              action={
                <Link href="/templates/novo" className={buttonClass({ variant: "primary" })}>
                  Cadastrar template
                </Link>
              }
            >
              Cadastre os templates aprovados de cada cliente para acompanhar status e pausas da Meta.
            </EmptyState>
          }
        />
      </Page>
    </AppShell>
  );
}
