import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { BmForm } from "../BmForm";
import s from "@/components/ui/crud.module.css";
import { exigirOperador } from "@/lib/auth/sessao";

export const metadata = { title: "Nova BM" };
export const dynamic = "force-dynamic";

export default async function NovaBmPage() {
  await exigirOperador("contingencia:ver");
  const clientes = await prisma.cliente.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  return (
    <AppShell>
      <div className={s.page}>
        <div className={s.header}>
          <div>
            <Link href="/bms" className={s.link}><Icon name="arrowUp" size={13} style={{ transform: "rotate(-90deg)" }} /> Business Managers</Link>
            <h1 className={s.title} style={{ marginTop: 4 }}>Nova BM</h1>
          </div>
        </div>
        <div className={s.panel}>
          <BmForm clientes={clientes} />
        </div>
      </div>
    </AppShell>
  );
}
