import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { StatusTag } from "@/components/ui/StatusTag";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { TEMPLATE_STATUS_MAP, TEMPLATE_CATEGORIA_MAP } from "@/lib/contingencia";
import { deleteTemplate } from "./actions";
import s from "@/components/ui/crud.module.css";
import { exigirOperador } from "@/lib/auth/sessao";

export const metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await exigirOperador("contingencia:ver");
  const templates = await prisma.template.findMany({
    orderBy: { criadoEm: "desc" },
    include: { cliente: { select: { nome: true } } },
  });

  return (
    <AppShell>
      <div className={s.page}>
        <div className={s.header}>
          <div>
            <h1 className={s.title}>Templates</h1>
            <p className={s.sub}>{templates.length} template(s) cadastrado(s) · dados salvos no banco</p>
          </div>
          <Link href="/templates/novo" className={`${s.btn} ${s.btnPrimary}`}>
            <Icon name="template" size={16} /> Novo template
          </Link>
        </div>

        <div className={s.panel}>
          {templates.length === 0 ? (
            <div className={s.empty}>
              <p className={s.emptyTitle}>Nenhum template cadastrado ainda</p>
              <p>Cadastre os modelos de mensagem (HSM) da sua operação.</p>
            </div>
          ) : (
            <div className={s.scroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Cliente</th>
                    <th>Categoria</th>
                    <th>Status</th>
                    <th>Idioma</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => {
                    const st = TEMPLATE_STATUS_MAP[t.status];
                    return (
                      <tr key={t.id}>
                        <td>
                          <span className={s.name}>{t.nome}</span>
                          <span style={{ display: "block", fontSize: "12px", color: "var(--ink-3)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.corpo}</span>
                        </td>
                        <td>{t.cliente?.nome ?? "—"}</td>
                        <td>{TEMPLATE_CATEGORIA_MAP[t.categoria] ?? t.categoria}</td>
                        <td>{st ? <StatusTag tone={st.tone} icon={st.icon}>{st.label}</StatusTag> : t.status}</td>
                        <td className={s.mono}>{t.idioma}</td>
                        <td>
                          <span className={s.rowActions}>
                            <Link href={`/templates/${t.id}`} className={s.link}>Editar</Link>
                            <form action={deleteTemplate}>
                              <input type="hidden" name="id" value={t.id} />
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
