import Link from "next/link";
import { BackLabel, Page, PageHeader } from "@eco/ui";
import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/lib/db";
import { BmForm } from "../BmForm";

export const metadata = { title: "Nova BM" };
export const dynamic = "force-dynamic";

export default async function NovaBmPage() {
  const clientes = await prisma.cliente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  return (
    <AppShell>
      <Page narrow>
        <PageHeader
          title="Nova BM"
          back={
            <Link href="/bms" className="eco-back">
              <BackLabel>Business Managers</BackLabel>
            </Link>
          }
        />
        <BmForm clientes={clientes} />
      </Page>
    </AppShell>
  );
}
