import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { StatusTag } from "@/components/ui/StatusTag";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { NUMERO_STATUS_MAP, QUALIDADE_MAP } from "@/lib/contingencia";
import { formatInt } from "@/lib/format";
import { deleteNumero } from "./actions";
import s from "@/components/ui/crud.module.css";

export const metadata = { title: "Números" };
export const dynamic = "force-dynamic";

export default async function NumerosPage() {
  const numeros = await prisma.numero.findMany({
    orderBy: { criadoEm: "desc" },
    include: { bm: { select: { nome: true } } },
  });

  return (
    <AppShell>
      <div className={s.page}>
        <div className={s.header}>
          <div>
            <h1 className={s.title}>Números</h1>
            <p className={s.sub}>{numeros.length} número(s) cadastrado(s) · dados salvos no banco</p>
          </div>
          <Link href="/numeros/novo" className={`${s.btn} ${s.btnPrimary}`}>
            <Icon name="phone" size={16} /> Novo número
          </Link>
        </div>

        <div className={s.panel}>
          {numeros.length === 0 ? (
            <div className={s.empty}>
              <p className={s.emptyTitle}>Nenhum número cadastrado ainda</p>
              <p>Cadastre os números de WhatsApp da sua operação.</p>
            </div>
          ) : (
            <div className={s.scroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Telefone</th>
                    <th>BM</th>
                    <th>Status</th>
                    <th>Qualidade</th>
                    <th>Uso hoje</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {numeros.map((n) => {
                    const st = NUMERO_STATUS_MAP[n.status];
                    const q = QUALIDADE_MAP[n.qualidade];
                    return (
                      <tr key={n.id}>
                        <td className={`${s.name} ${s.mono}`}>{n.telefone}</td>
                        <td>{n.bm?.nome ?? "—"}</td>
                        <td>{st ? <StatusTag tone={st.tone} icon={st.icon}>{st.label}</StatusTag> : n.status}</td>
                        <td>{q ? <StatusTag tone={q.tone} icon={q.icon}>{q.label}</StatusTag> : n.qualidade}</td>
                        <td className={s.mono}>{formatInt(n.enviadasHoje)}{n.limiteDiario ? ` / ${formatInt(n.limiteDiario)}` : ""}</td>
                        <td>
                          <span className={s.rowActions}>
                            <Link href={`/numeros/${n.id}`} className={s.link}>Editar</Link>
                            <form action={deleteNumero}>
                              <input type="hidden" name="id" value={n.id} />
                              <button type="submit" className={`${s.link} ${s.linkDanger}`}>Excluir</button>
                            </form>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
