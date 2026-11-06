"use client";
import { isManagerRole } from "@/lib/roles";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fmtDateTime, fmtInt, fmtMoney, fmtPct, CATEGORY_LABEL } from "@/lib/format";
import { previewFor, type Placeholders } from "@/lib/template-vars";
import { api, fmtPhone, Progress, RATE_OPTIONS, STATUS_LABEL, STATUS_TONE, type CampaignRow, type Counts } from "@/components/Campaigns";

type Recipient = { id: number; phone: string; name: string | null; status: string; replied: boolean; error_code: number | null; error_title: string | null; sent_at: string | null; conversation_id: number | null; params: Record<string, string> | null };
type Detail = {
  campaign: CampaignRow & { mapping: any; audience: any; template_language: string };
  recipients: Recipient[]; total: number; page: number; limit: number;
  failures: { error_code: number | null; error_title: string; n: number }[];
  template: { components: any[] | null } | null; placeholders: Placeholders; unit_cost: number | null;
};
const R_LABEL: Record<string, string> = { pending: "Na fila", sending: "Enviando", sent: "Enviado", delivered: "Entregue", read: "Lido", failed: "Falhou", skipped: "Pulado" };
const R_TONE: Record<string, string> = { pending: "neutral", sending: "warning", sent: "neutral", delivered: "good", read: "good", failed: "critical", skipped: "serious" };

export default function CampaignDetail({ id, role }: { id: number; role: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [f, setF] = useState({ rstatus: "", replied: false, q: "", page: 1 });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const canEdit = isManagerRole(role);

  const load = useCallback(() => {
    const q = new URLSearchParams(); if (f.rstatus) q.set("rstatus", f.rstatus); if (f.replied) q.set("replied", "1"); if (f.q) q.set("q", f.q); q.set("page", String(f.page));
    return api(`/api/campanhas/${id}?${q}`).then(setD).catch((e) => setErr(e.message));
  }, [id, f]);
  useEffect(() => { load(); }, [load]);
  const live = d?.campaign.status === "running" || d?.campaign.status === "scheduled";
  useEffect(() => { if (!live) return; const t = setInterval(load, 4000); return () => clearInterval(t); }, [live, load]);

  const act = async (action: string, extra: any = {}) => {
    setBusy(true); setErr("");
    try {
      const j = await api(`/api/campanhas/${id}`, { action, ...extra });
      if (j.deleted) { window.location.href = "/disparos"; return; }
      if (action === "duplicate") { window.location.href = `/disparos/${j.id}`; return; }
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!d) return <div className="card">{err || "Carregando…"}</div>;
  const c = d.campaign, k: Counts = c.counts, ok = k.sent + k.delivered + k.read;
  const cost = d.unit_cost != null ? (k.billable || ok) * d.unit_cost : null;
  const pages = Math.max(1, Math.ceil(d.total / d.limit));
  const sample = { name: "Maria Souza", phone: "5585999990000", email: "maria@exemplo.com", fields: {} };

  return (
    <>
      <div className="topbar">
        <div className="title">
          <h1 style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{c.name} <span className={`pill ${STATUS_TONE[c.status]}`}><i aria-hidden />{STATUS_LABEL[c.status]}</span></h1>
          <p>{c.template_name} ({CATEGORY_LABEL[c.template_category || ""] || c.template_category || "—"}) · {c.phone_name || c.display_phone_number} · {c.waba_name} · criado por {c.created_by_name || "—"} em {fmtDateTime(c.created_at)}{c.scheduled_at && c.status === "scheduled" ? ` · início ${fmtDateTime(c.scheduled_at)}` : ""}{c.finished_at ? ` · encerrado ${fmtDateTime(c.finished_at)}` : ""}</p>
        </div>
        <div className="row-actions">
          <Link className="btn" href="/disparos">← Disparos</Link>
          <a className="btn" href={`/api/campanhas/${id}?export=1`}>Exportar CSV</a>
          {canEdit && (c.status === "draft" || c.status === "paused" || c.status === "scheduled") && <button className="btn primary" disabled={busy} onClick={() => act("start")}>{c.status === "paused" ? "Retomar agora" : "Enviar agora"}</button>}
          {canEdit && (c.status === "draft" || c.status === "paused") && <button className="btn" disabled={busy} onClick={() => setShowSchedule(!showSchedule)}>Agendar</button>}
          {canEdit && (c.status === "running" || c.status === "scheduled") && <button className="btn" disabled={busy} onClick={() => act("pause")}>Pausar</button>}
          {canEdit && k.failed > 0 && c.status !== "running" && <button className="btn" disabled={busy} onClick={() => act("retry_failed")}>Reenviar falhas ({fmtInt(k.failed)})</button>}
          {canEdit && !["done", "cancelled"].includes(c.status) && <button className="btn" disabled={busy} onClick={() => confirm("Cancelar este disparo? Quem ainda está na fila não receberá.") && act("cancel")}>Cancelar</button>}
          {canEdit && <button className="btn" disabled={busy} onClick={() => act("duplicate")}>Duplicar</button>}
          {canEdit && c.status !== "running" && <button className="btn" disabled={busy} onClick={() => confirm("Excluir este disparo e seu histórico de destinatários?") && act("delete")}>Excluir</button>}
        </div>
      </div>
      {err && <div className="banner err">{err}</div>}
      {c.last_error && <div className="banner err">{c.last_error}</div>}
      {showSchedule && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="src-row"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /><button className="btn primary" disabled={!when || busy} onClick={() => { act("schedule", { scheduled_at: new Date(when).toISOString() }); setShowSchedule(false); }}>Confirmar agendamento</button></div>
        </div>
      )}

      <div className="grid kpis" style={{ marginBottom: 14 }}>
        <div className="card kpi"><div className="label">Público</div><div className="value">{fmtInt(c.total)}</div><div className="delta">{fmtInt(k.pending + k.sending)} na fila</div></div>
        <div className="card kpi"><div className="label">Enviados</div><div className="value">{fmtInt(ok)}</div><div className="delta">{c.total ? fmtPct(ok / c.total) : "—"} do público</div></div>
        <div className="card kpi"><div className="label">Entregues</div><div className="value">{fmtInt(k.delivered + k.read)}</div><div className="delta">{ok ? fmtPct((k.delivered + k.read) / ok) : "—"} dos enviados</div></div>
        <div className="card kpi"><div className="label">Lidos</div><div className="value">{fmtInt(k.read)}</div><div className="delta">{ok ? fmtPct(k.read / ok) : "—"} dos enviados</div></div>
        <div className="card kpi"><div className="label">Respostas</div><div className="value">{fmtInt(k.replied)}</div><div className="delta">{ok ? fmtPct(k.replied / ok) : "—"} dos enviados</div></div>
        <div className="card kpi"><div className="label">Falhas / pulados</div><div className="value" style={{ color: k.failed ? "var(--critical)" : undefined }}>{fmtInt(k.failed)} / {fmtInt(k.skipped)}</div><div className="delta">{cost != null ? `custo est. ${fmtMoney(cost)}` : "sem estimativa de custo"}</div></div>
      </div>

      <div className="grid two" style={{ marginBottom: 14 }}>
        <div className="card">
          <h2>Progresso</h2>
          <p className="sub">{c.status === "running" ? `Enviando ${RATE_OPTIONS.find((r) => r.v === c.rate_per_minute)?.l.toLowerCase() || `${c.rate_per_minute}/min`} · atualiza sozinho` : c.status === "scheduled" ? "Aguardando o horário agendado" : "Parado"}</p>
          <Progress c={k} total={c.total} />
          {d.failures.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table><thead><tr><th>Motivo</th><th>Código</th><th>Qtd.</th></tr></thead>
                <tbody>{d.failures.map((x, i) => <tr key={i}><td>{x.error_title}</td><td className="muted">{x.error_code ?? "—"}</td><td>{fmtInt(x.n)}</td></tr>)}</tbody></table>
            </div>
          )}
        </div>
        <div className="card">
          <h2>Mensagem</h2>
          <p className="sub">{c.template_name} · {c.template_language}</p>
          <div className="bubble preview"><div className="bubble-text">{previewFor(d.template?.components, d.placeholders, c.mapping, sample)}</div></div>
          {c.mapping?.header?.media_id && <p className="muted" style={{ fontSize: 12 }}>Cabeçalho com {c.mapping.header.kind}: {c.mapping.header.filename || c.mapping.header.media_id}</p>}
        </div>
      </div>

      <div className="card">
        <h2>Destinatários</h2>
        <div className="toolbar" style={{ marginTop: 8 }}>
          <input type="search" placeholder="Buscar nome ou telefone" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
          <select value={f.rstatus} onChange={(e) => setF({ ...f, rstatus: e.target.value, page: 1 })}><option value="">Todos os status</option>{Object.entries(R_LABEL).map(([k2, v]) => <option key={k2} value={k2}>{v}</option>)}</select>
          <label className="check small"><input type="checkbox" checked={f.replied} onChange={(e) => setF({ ...f, replied: e.target.checked, page: 1 })} /> Só quem respondeu</label>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Contato</th><th>Status</th><th>Respondeu</th><th>Enviado em</th><th>Variáveis</th><th>Erro</th><th></th></tr></thead>
            <tbody>
              {d.recipients.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name || "—"}</b><div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtPhone(r.phone)}</div></td>
                  <td><span className={`pill ${R_TONE[r.status] || "neutral"}`}><i aria-hidden />{R_LABEL[r.status] || r.status}</span></td>
                  <td>{r.replied ? <span className="ok">Sim</span> : <span className="muted">—</span>}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.sent_at ? fmtDateTime(r.sent_at) : "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.params ? Object.values(r.params).join(" · ") : "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.error_title ? `${r.error_code ? `${r.error_code} · ` : ""}${r.error_title}` : "—"}</td>
                  <td>{r.conversation_id ? <Link className="btn" href={`/atendimento?c=${r.conversation_id}`}>Conversa</Link> : null}</td>
                </tr>
              ))}
              {!d.recipients.length && <tr><td colSpan={7} className="muted">Nenhum destinatário com esse filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{fmtInt(d.total)} destinatário(s)</span><button className="btn" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>‹</button><span>{f.page} / {pages}</span><button className="btn" disabled={f.page >= pages} onClick={() => setF({ ...f, page: f.page + 1 })}>›</button></div>
      </div>
    </>
  );
}
