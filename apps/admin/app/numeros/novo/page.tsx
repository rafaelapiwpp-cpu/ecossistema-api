import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { NumeroForm } from "../NumeroForm";
import s from "@/components/ui/crud.module.css";
import { exigirOperador } from "@/lib/auth/sessao";

export const metadata = { title: "Novo número" };
export const dynamic = "force-dynamic";

export default async function NovoNumeroPage() {
  await exigirOperador("contingencia:ver");
  const bms = await prisma.bm.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  return (
    <AppShell>
      <div className={s.page}>
        <div className={s.header}>
          <div>
            <Link href="/numeros" className={s.link}><Icon name="arrowUp" size={13} style={{ transform: "rotate(-90deg)" }} /> Números</Link>
            <h1 className={s.title} style={{ marginTop: 4 }}>Novo número</h1>
          </div>
        </div>
        <div className={s.panel}>
          <NumeroForm bms={bms} />
        </div>
      </div>
    </AppShell>
  );
}
