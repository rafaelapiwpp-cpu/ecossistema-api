import Header from "@/components/Header";
import { QualityPill, StatusPill } from "@/components/Pill";
import { getView, type SP } from "@/lib/view";
import { CATEGORY_LABEL, fmtDateTime, fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import { DeleteTemplateButton, InsightsButton, NewTemplateButton } from "@/components/TemplateEditor";
import { isAdminRole } from "@/lib/roles";
import { hasDb, query } from "@/lib/db";

export const dynamic = "force-dynamic";

type Hub = { waba_id: string; template_name: string; sent: number; delivered: number; read: number; failed: number; replied: number; last_at: string | null };

/** O que o próprio HUB enviou com cada template no período (atendimento, disparos e fluxos), pelos status do webhook. */
async function hubStats(from: string, to: string, only: string[] | null): Promise<Hub[]> {
  if (!hasDb()) return [];
  try {
    return await query<Hub>(
      `select m.waba_id, m.template_name,
         count(*)::int as sent,
         count(*) filter (where m.status in ('delivered','read'))::int as delivered,
         count(*) filter (where m.status = 'read')::int as read,
         count(*) filter (where m.status = 'failed')::int as failed,
         count(*) filter (where exists (select 1 from messages i where i.conversation_id = m.conversation_id and i.direction = 'in' and i.ts > m.ts and i.ts < m.ts + interval '3 days'))::int as replied,
         max(m.ts) as last_at
       from messages m where m.direction = 'out' and m.type = 'template' and m.template_name is not null and m.ts >= $1::date and m.ts < ($2::date + 1)
         and ($3::text[] is null or m.waba_id = any($3::text[]))
       group by m.waba_id, m.template_name`, [from, to, only]);
  } catch { return []; }
}

export default async function Templates({ searchParams }: { searchParams: SP }) {
  const { all, ds, cur, currency, period, session, scope } = await getView(searchParams, { failures: false });
  const hub = await hubStats(period.from, period.to, scope && !scope.all ? scope.wabas : null);
  const canEdit = !!session && session.user.role !== "atendente";
  const isAdmin = !!session && isAdminRole(session.user.role);
  const agg = new Map<string, { sent: number; delivered: number; read: number; clicks: number; cost: number }>();
  for (const r of cur.templateDaily) {
    const x = agg.get(r.template_id) || { sent: 0, delivered: 0, read: 0, clicks: 0, cost: 0 };
    x.sent += r.sent; x.delivered += r.delivered; x.read += r.read; x.clicks += r.clicks; x.cost += r.cost;
    agg.set(r.template_id, x);
  }
  const zero = { sent: 0, delivered: 0, read: 0, clicks: 0, cost: 0 };
  const hubBy = new Map(hub.map((h) => [`${h.waba_id}|${h.template_name}`, h]));
  const rows = ds.templates
    .map((t) => ({ t, m: agg.get(t.id) || zero, h: hubBy.get(`${t.waba_id}|${t.name}`) || null }))
    .sort((a, b) => b.m.sent - a.m.sent || (b.h?.sent || 0) - (a.h?.sent || 0) || a.t.name.localeCompare(b.t.name));
  const wname = (id: string) => all.wabas.find((w) => w.id === id)?.name || id;
  const by = (s: string) => ds.templates.filter((t) => t.status === s).length;
  const tot = rows.reduce((a, r) => ({ sent: a.sent + r.m.sent, delivered: a.delivered + r.m.delivered, read: a.read + r.m.read, clicks: a.clicks + r.m.clicks, cost: a.cost + r.m.cost, hub: a.hub + (r.h?.sent || 0), hubRead: a.hubRead + (r.h?.read || 0) }), { sent: 0, delivered: 0, read: 0, clicks: 0, cost: 0, hub: 0, hubRead: 0 });
  const withoutInsights = all.wabas.filter((w: any) => !w.insights);
  const pendingInsights = withoutInsights.filter((w) => !ds.templates.length || ds.templates.some((t) => t.waba_id === w.id)).length;

  return (
    <>
      <Header title="Templates" subtitle={`${ds.templates.length} templates · ${by("APPROVED")} aprovados · ${by("PENDING")} em análise · ${by("REJECTED")} rejeitados`} all={all} />
      <div className="toolbar">
        <span className="muted" style={{ fontSize: 13 }}>Métricas do período selecionado acima: as da Meta valem para qualquer ferramenta que use a conta; "pelo Ecossistema" é o que foi enviado por aqui.</span>
        <span style={{ flex: 1 }} />
        {hasDb() && <InsightsButton pending={pendingInsights} isAdmin={isAdmin} />}
        {canEdit && <NewTemplateButton wabas={all.wabas} canEdit={canEdit} />}
      </div>
      {pendingInsights > 0 && (
        <div className="banner warn">
          <b>Métricas da Meta desligadas em {pendingInsights} conta(s)</b> ({withoutInsights.map((w) => w.name || w.id).join(", ")}): envios, entregas, leituras e cliques por template só aparecem depois de ativar.
          {isAdmin ? " Clique em \"Ativar métricas da Meta\"." : " Peça ao administrador para ativar."}
        </div>
      )}

      <div className="grid kpis">
        <div className="card kpi"><div className="label">Enviados (Meta)</div><div className="value num">{fmtInt(tot.sent)}</div><div className="delta">todos os templates no período</div></div>
        <div className="card kpi"><div className="label">Taxa de entrega</div><div className="value num">{tot.sent ? fmtPct(tot.delivered / tot.sent) : "—"}</div><div className="delta">{fmtInt(tot.delivered)} entregues</div></div>
        <div className="card kpi"><div className="label">Taxa de leitura</div><div className="value num">{tot.delivered ? fmtPct(tot.read / tot.delivered) : "—"}</div><div className="delta">{fmtInt(tot.read)} lidos</div></div>
        <div className="card kpi"><div className="label">Cliques em botões</div><div className="value num">{fmtInt(tot.clicks)}</div><div className="delta">{tot.read ? fmtPct(tot.clicks / tot.read) : "—"} dos lidos</div></div>
        <div className="card kpi"><div className="label">Custo</div><div className="value num">{fmtMoney(tot.cost, currency)}</div><div className="delta">{tot.read ? `${fmtMoney(tot.cost / tot.read, currency)} por leitura` : "informado pela Meta"}</div></div>
        <div className="card kpi"><div className="label">Enviados pelo Ecossistema</div><div className="value num">{fmtInt(tot.hub)}</div><div className="delta">{tot.hub ? `${fmtPct(tot.hubRead / tot.hub)} lidos` : "atendimento, disparos e fluxos"}</div></div>
      </div>

      <div className="card section">
        <h2>Desempenho por template</h2>
        <p className="sub">A Meta guarda métricas por até 90 dias; leituras e cliques, por 7 dias após o envio. "Respostas" conta quem respondeu em até 3 dias a um envio feito pelo Ecossistema.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Template</th><th>Categoria</th><th>Status</th><th>Qualidade</th>
                <th className="r">Enviados</th><th className="r">Entrega</th><th className="r">Leitura</th>
                <th className="r">Cliques</th><th className="r">Custo</th>
                <th className="r">Pelo Ecossistema</th><th className="r">Respostas</th><th>Último envio</th>{canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, m, h }) => (
                <tr key={t.id}>
                  <td><b>{t.name}</b><div className="muted" style={{ fontSize: 12 }}>{wname(t.waba_id)} · {t.language}</div>{t.rejected_reason && <div className="muted" style={{ fontSize: 12 }}>Motivo: {t.rejected_reason}</div>}</td>
                  <td>{CATEGORY_LABEL[t.category || ""] || t.category}</td>
                  <td><StatusPill s={t.status} /></td>
                  <td><QualityPill q={t.quality_score} /></td>
                  <td className="r num">{fmtInt(m.sent)}</td>
                  <td className="r num">{m.sent ? fmtPct(m.delivered / m.sent) : "—"}</td>
                  <td className="r num">{m.delivered ? <b>{fmtPct(m.read / m.delivered)}</b> : "—"}{m.read ? <div className="muted" style={{ fontSize: 11 }}>{fmtInt(m.read)} lidos</div> : null}</td>
                  <td className="r num">{m.clicks ? fmtInt(m.clicks) : "—"}</td>
                  <td className="r num">{m.cost ? fmtMoney(m.cost, currency) : "—"}</td>
                  <td className="r num">{h ? <>{fmtInt(h.sent)}<div className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{h.sent ? `${fmtPct(h.read / h.sent)} lidos` : ""}{h.failed ? ` · ${fmtInt(h.failed)} falha(s)` : ""}</div></> : "—"}</td>
                  <td className="r num">{h?.replied ? <>{fmtInt(h.replied)} <span className="muted">({fmtPct(h.replied / Math.max(h.sent, 1))})</span></> : "—"}</td>
                  <td className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{h?.last_at ? fmtDateTime(h.last_at) : "—"}</td>
                  {canEdit && <td><DeleteTemplateButton wabaId={t.waba_id} name={t.name} canEdit={canEdit} /></td>}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={13} className="empty">Nenhum template sincronizado ainda</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
