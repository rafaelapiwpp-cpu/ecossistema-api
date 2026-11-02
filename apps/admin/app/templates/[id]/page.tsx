import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLabel, ConfirmAction, Page, PageHeader } from "@eco/ui";
import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/lib/db";
import { TemplateForm } from "../TemplateForm";
import { deleteTemplate } from "../actions";

export const metadata = { title: "Editar template" };
export const dynamic = "force-dynamic";

export default async function EditarTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [template, clientes] = await Promise.all([
    prisma.template.findUnique({ where: { id } }),
    prisma.cliente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  if (!template) notFound();

  return (
    <AppShell>
      <Page>
        <PageHeader
          title={template.nome}
          back={
            <Link href="/templates" className="eco-back">
              <BackLabel>Templates</BackLabel>
            </Link>
          }
          actions={
            <ConfirmAction action={deleteTemplate} fields={{ id: template.id }} target={template.nome} label="Excluir template" confirmLabel="Excluir" look="button" size="md" />
          }
        />
        <TemplateForm
          clientes={clientes}
          template={{
            id: template.id,
            nome: template.nome,
            clienteId: template.clienteId,
            categoria: template.categoria,
            status: template.status,
            idioma: template.idioma,
            corpo: template.corpo,
          }}
        />
      </Page>
    </AppShell>
  );
}
