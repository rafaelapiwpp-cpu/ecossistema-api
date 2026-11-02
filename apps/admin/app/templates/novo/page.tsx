import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { TemplateForm } from "../TemplateForm";
import s from "@/components/ui/crud.module.css";

export const metadata = { title: "Novo template" };
export const dynamic = "force-dynamic";

export default async function NovoTemplatePage() {
  const clientes = await prisma.cliente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  return (
    <AppShell>
      <div className={s.page}>
        <div className={s.header}>
          <div>
            <Link href="/templates" className={s.link}><Icon name="arrowUp" size={13} style={{ transform: "rotate(-90deg)" }} /> Templates</Link>
            <h1 className={s.title} style={{ marginTop: 4 }}>Novo template</h1>
          </div>
        </div>
        <div className={s.panel}>
          <TemplateForm clientes={clientes} />
        </div>
      </div>
    </AppShell>
  );
}
