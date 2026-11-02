import Link from "next/link";
import { BackLabel, Page, PageHeader } from "@eco/ui";
import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/lib/db";
import { TemplateForm } from "../TemplateForm";

export const metadata = { title: "Novo template" };
export const dynamic = "force-dynamic";

export default async function NovoTemplatePage() {
  const clientes = await prisma.cliente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  return (
    <AppShell>
      <Page>
        <PageHeader
          title="Novo template"
          back={
            <Link href="/templates" className="eco-back">
              <BackLabel>Templates</BackLabel>
            </Link>
          }
        />
        <TemplateForm clientes={clientes} />
      </Page>
    </AppShell>
  );
}
