import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { StatusTag } from "@/components/ui/StatusTag";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { BM_STATUS_MAP, BM_VERIFICACAO_MAP, nivelLabel } from "@/lib/contingencia";
import { deleteBm } from "./actions";
import s from "@/components/ui/crud.module.css";
import { exigirOperador } from "@/lib/auth/sessao";

export const metadata = { title: "Business Managers" };
export const dynamic = "force-dynamic";

export default async function BmsPage() {
  await exigirOperador("contingencia:ver");
  const bms = await prisma.bm.findMany({
    orderBy: { criadoEm: "desc" },
    include: { cliente: { select: { nome: true } }, _count: { select: { numeros: true } } },
  });

  return (
    <AppShell>
      <div className={s.page}>
        <div className={s.header}>
          <div>
            <h1 className={s.title}>Business Managers</h1>
            <p className={s.sub}>{bms.length} BM(s) cadastrada(s) · dados salvos no banco</p>
          </div>
          <Link href="/bms/novo" className={`${s.btn} ${s.btnPrimary}`}>
            <Icon name="businessManager" size={16} /> Nova BM
          </Link>
        </div>

        <div className={s.panel}>
          {bms.length === 0 ? (
            <div className={s.empty}>
              <p className={s.emptyTitle}>Nenhuma BM cadastrada ainda</p>
              <p>Cadastre sua primeira Business Manager para começar a gerenciar sua contingência.</p>
            </div>
          ) : (
            <div className={s.scroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>BM</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Verificação</th>
                    <th>Limite 24h</th>
                    <th>Números</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {bms.map((bm) => {
                    const st = BM_STATUS_MAP[bm.status];
                    const vf = BM_VERIFICACAO_MAP[bm.verificacao];
                    return (
                      <tr key={bm.id}>
                        <td>
                          <span className={s.name}>{bm.nome}</span>
                          {bm.metaBmId && <span className={s.mono} style={{ display: "block", fontSize: "12px", color: "var(--ink-3)" }}>{bm.metaBmId}</span>}
                        </td>
                        <td>{bm.cliente?.nome ?? "—"}</td>
                        <td>{st ? <StatusTag tone={st.tone} icon={st.icon}>{st.label}</StatusTag> : bm.status}</td>
                        <td>{vf ? <StatusTag tone={vf.tone} icon={vf.icon}>{vf.label}</StatusTag> : bm.verificacao}</td>
                        <td className={s.mono}>{nivelLabel(bm.nivelLimite)}</td>
                        <td className={s.mono}>{bm._count.numeros}</td>
                        <td>
                          <span className={s.rowActions}>
                            <Link href={`/bms/${bm.id}`} className={s.link}>Editar</Link>
                            <form action={deleteBm}>
                              <input type="hidden" name="id" value={bm.id} />
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
