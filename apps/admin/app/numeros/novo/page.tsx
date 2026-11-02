import Link from "next/link";
import { BackLabel, Page, PageHeader } from "@eco/ui";
import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/lib/db";
import { NumeroForm } from "../NumeroForm";

export const metadata = { title: "Novo número" };
export const dynamic = "force-dynamic";

export default async function NovoNumeroPage() {
  const bms = await prisma.bm.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  return (
    <AppShell>
      <Page narrow>
        <PageHeader
          title="Novo número"
          back={
            <Link href="/numeros" className="eco-back">
              <BackLabel>Números</BackLabel>
            </Link>
          }
        />
        <NumeroForm bms={bms} />
      </Page>
    </AppShell>
  );
}
