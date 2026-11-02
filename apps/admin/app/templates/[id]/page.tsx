import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { TemplateForm } from "../TemplateForm";
import { deleteTemplate } from "../actions";
import s from "@/components/ui/crud.module.css";

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
      <div className={s.page}>
        <div className={s.header}>
          <div>
            <Link href="/templates" className={s.link}><Icon name="arrowUp" size={13} style={{ transform: "rotate(-90deg)" }} /> Templates</Link>
            <h1 className={s.title} style={{ marginTop: 4 }}>{template.nome}</h1>
          </div>
          <form action={deleteTemplate}>
            <input type="hidden" name="id" value={template.id} />
            <button type="submit" className={`${s.btn} ${s.btnDanger}`}>
              <Icon name="x" size={15} /> Excluir
            </button>
          </form>
        </div>
        <div className={s.panel}>
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
        </div>
      </div>
    </AppShell>
  );
}
