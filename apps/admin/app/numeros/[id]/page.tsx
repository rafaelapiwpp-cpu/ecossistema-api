import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { prisma } from "@/lib/db";
import { NumeroForm } from "../NumeroForm";
import { deleteNumero, retomarEnvio } from "../actions";
import s from "@/components/ui/crud.module.css";
import { exigirOperador } from "@/lib/auth/sessao";

export const metadata = { title: "Editar número" };
export const dynamic = "force-dynamic";

const DISJUNTOR: Record<string, string> = { fechado: "Enviando", aberto: "Envio parado", meio_aberto: "Em teste (volume mínimo)" };

export default async function EditarNumeroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const op = await exigirOperador("contingencia:ver");
  const { id } = await params;
  const sp = await searchParams;
  const erro = typeof sp.erro === "string" ? sp.erro.slice(0, 300) : undefined;
  const [numero, bms, eventos] = await Promise.all([
    prisma.numero.findUnique({ where: { id } }),
    prisma.bm.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.eventoContingencia.findMany({ where: { numeroId: id }, orderBy: { em: "desc" }, take: 8 }),
  ]);
  if (!numero) notFound();
  const podeOperar = op.permissoes.has("contingencia:operar");

  return (
    <AppShell>
      <div className={s.page}>
        <div className={s.header}>
          <div>
            <Link href="/numeros" className={s.link}><Icon name="arrowUp" size={13} style={{ transform: "rotate(-90deg)" }} /> Números</Link>
            <h1 className={s.title} style={{ marginTop: 4 }}>{numero.telefone}</h1>
          </div>
          <form action={deleteNumero}>
            <input type="hidden" name="id" value={numero.id} />
            <button type="submit" className={`${s.btn} ${s.btnDanger}`}>
              <Icon name="x" size={15} /> Excluir
            </button>
          </form>
        </div>
        {erro && (
          <p role="alert" className={s.panel} style={{ borderColor: "var(--danger-border)", color: "var(--text-primary)" }}>
            {erro}
          </p>
        )}

        <div className={s.panel} aria-labelledby="t-envio">
          <h2 id="t-envio" className={s.title} style={{ fontSize: "var(--text-md)" }}>
            Envio: {DISJUNTOR[numero.disjuntor] ?? numero.disjuntor}
          </h2>
          {numero.motivoPausa && <p className={s.sub}>Motivo: {numero.motivoPausa}</p>}
          {numero.disjuntor !== "fechado" && podeOperar && (
            <form action={retomarEnvio} className={s.form} style={{ marginTop: "var(--s3)" }}>
              <input type="hidden" name="id" value={numero.id} />
              <div className={`${s.field} ${s.fieldWide}`}>
                <label className={s.label} htmlFor="motivo">O que mudou para retomar (fica na auditoria)</label>
                <textarea id="motivo" name="motivo" required minLength={10} maxLength={500} rows={2} className={s.textarea} />
              </div>
              <div className={s.field}>
                <label className={s.label} htmlFor="modo">Como retomar</label>
                <select id="modo" name="modo" className={s.select} defaultValue="meio_aberto">
                  <option value="meio_aberto">Em teste (volume mínimo)</option>
                  <option value="fechado">Normalmente</option>
                </select>
              </div>
              <div className={s.formActions}>
                <button type="submit" className={`${s.btn} ${s.btnPrimary}`}>Retomar envio</button>
              </div>
            </form>
          )}
          {eventos.length > 0 && (
            <ul style={{ listStyle: "none", margin: "var(--s3) 0 0", padding: 0 }}>
              {eventos.map((e) => (
                <li key={e.id} className={s.sub} style={{ padding: "6px 0", borderTop: "1px solid var(--border-subtle)" }}>
                  <time dateTime={e.em.toISOString()}>{e.em.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</time>
                  {" · "}
                  {e.texto}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={s.panel}>
          <NumeroForm
            bms={bms}
            numero={{
              id: numero.id,
              telefone: numero.telefone,
              bmId: numero.bmId,
              status: numero.status,
              qualidade: numero.qualidade,
              limiteDiario: numero.limiteDiario,
              enviadasHoje: numero.enviadasHoje,
              metaPhoneId: numero.metaPhoneId,
              notas: numero.notas,
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
