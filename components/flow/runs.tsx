"use client";
// Iniciar, testar, adicionar números e acompanhamento (execuções e distribuição) de um fluxo.
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { fmtDateTime, fmtInt, fmtPct, QUALITY_LABEL } from "@/lib/format";
import { NODE_LABEL, RUN_STATUS, groupOf, phoneSplitOf, portsOf, type FlowNode, type Graph } from "@/lib/flow-shared";
import { metaErrorHint } from "@/lib/meta-errors";
import { api, fmtPhone } from "@/components/Campaigns";
import { CatPill, estimateGroup } from "./panels";
import type { Ctx } from "./shared";

const MSG_LABEL: Record<string, string> = { sending: "Enviando", pending: "Enviando", accepted: "Enviada", sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Não entregue" };
const MSG_TONE: Record<string, string> = { sending: "neutral", pending: "neutral", accepted: "neutral", sent: "neutral", delivered: "good", read: "good", failed: "critical" };
const failText = (code: number | null, title: string | null) => `${metaErrorHint(code) || title || "A Meta não entregou"}${code ? ` (${code})` : ""}`;
/** Versão curta do motivo para a tabela (ex.: "Pagamento (131042)"); o texto completo fica na dica e nos detalhes. */
const failShort = (code: number | null, title: string | null) => `${(metaErrorHint(code) || title || "A Meta não entregou").split(/[:.,;—(]/)[0].trim().slice(0, 48)}${code ? ` (${code})` : ""}`;

/** Linha do tempo de uma execução: por onde passou, o que foi enviado (entregue/lida/falhou) e o que o contato respondeu. */
function RunTimeline({ flowId, runId, graph }: { flowId: number; runId: number; graph: Graph }) {
  const [d, setD] = useState<{ events: any[]; messages: any[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api(`/api/fluxos/${flowId}?run=${runId}`).then(setD).catch((e) => setErr(e.message)); }, [flowId, runId]);
  if (err) return <div className="banner err">{err}</div>;
  if (!d) return <div className="muted" style={{ fontSize: 12 }}>Carregando…</div>;
  const node = (id: string) => graph.nodes.find((n) => n.id === id);
  const name = (id: string) => { const n = node(id); return n ? String(n.data?.title || "").trim() || NODE_LABEL[n.type] : "bloco removido"; };
  const portLabel = (id: string, port: string) => { const n = node(id); return (n && portsOf(n).find((p) => p.id === port)?.label) || port; };
  type Item = { at: string; key: string; el: React.ReactNode };
  const items: Item[] = [];
  for (const [i, e] of d.events.entries()) {
    const k = `e${i}`;
    if (e.type === "trigger") items.push({ at: e.created_at, key: k, el: <>Iniciou pelo gatilho “Mensagem recebida”: “{String(e.data?.text || "").slice(0, 120) || "mídia"}”{e.data?.keyword ? <> (palavra-chave <b>{e.data.keyword}</b>)</> : null}</> });
    else if (e.type === "enter") items.push({ at: e.created_at, key: k, el: <>Entrou em <b>{name(e.node_id)}</b></> });
    else if (e.type === "branch" && e.data?.port && e.data.port !== "out") items.push({ at: e.created_at, key: k, el: <>Seguiu por “{portLabel(e.node_id, e.data.port)}”</> });
    else if (e.type === "error") items.push({ at: e.created_at, key: k, el: <span style={{ color: "var(--critical)" }}>Erro em {name(e.node_id)}: {failText(e.data?.code ?? null, e.data?.message ?? null)}</span> });
    else if (e.type === "undelivered") items.push({ at: e.created_at, key: k, el: <span style={{ color: "var(--critical)" }}>A Meta avisou que não entregou: {e.data?.message || failText(e.data?.code ?? null, e.data?.title ?? null)}</span> });
  }
  const warned = d.events.some((e) => e.type === "undelivered"); // o motivo já aparece no aviso da Meta
  for (const m of d.messages) {
    const what = m.direction === "in" ? <>Respondeu: “{String(m.body || m.type).slice(0, 120)}”</> : <>Enviou {m.type === "template" ? <>o template <b>{m.template_name}</b></> : "mensagem"}{" "}<span className={`pill ${MSG_TONE[m.status] || "neutral"}`}><i aria-hidden />{MSG_LABEL[m.status] || m.status || "—"}</span>{m.status === "failed" && !warned && <span style={{ color: "var(--critical)" }}> {failText(m.error_code, m.error_title)}</span>}</>;
    items.push({ at: m.ts, key: `m${m.id}`, el: what });
  }
  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return items.length
    ? <ol className="run-tl">{items.map((x) => <li key={x.key}><time>{fmtDateTime(x.at)}</time>{x.el}</li>)}</ol>
    : <div className="muted" style={{ fontSize: 12 }}>Ainda não começou (está na fila).</div>;
}

export const RUN_TONE: Record<string, string> = { queued: "neutral", running: "good", waiting_reply: "warning", waiting_time: "warning", done: "good", failed: "critical", cancelled: "neutral", stopped: "serious" };

export type FlowRow = { id: number; name: string; waba_id: string; phone_number_id: string; status: string; graph: Graph; settings: any; last_error: string | null; display_phone_number: string | null; phone_name: string | null; waba_name: string | null; updated_at: string };
type PhoneStat = { phone_number_id: string; runs: number; queued: number; done: number; failed: number; sent: number; delivered: number; read: number; undelivered: number };
type TemplateStat = { node_id: string; template_id: string; template_name: string; category: string | null; phone_number_id: string; sent: number; errors: number; delivered: number; read: number; undelivered: number };
export type Loaded = {
  flow: FlowRow;
  stats: { counts: Record<string, number>; nodes: { node_id: string; entered: number; errors: number; undelivered?: number; waiting?: number }[]; branches: { node_id: string; port: string; n: number }[]; phones?: PhoneStat[]; templates?: TemplateStat[] };
  templates: Ctx["templates"]; problems: string[]; runs: any[]; runsTotal: number;
};

type Breakdown = { fresh: number; active: number; done: number; failed: number; optout: number };
export function StartModal({ flow, graph, problems, onClose, onStart }: { flow: FlowRow; graph: Graph; problems: string[]; onClose: () => void; onStart: (when: string | null, opt: { retry_failed: boolean; resend_done: boolean }) => Promise<void> }) {
  const [preview, setPreview] = useState<{ total: number; sample: { phone: string; name: string | null }[]; breakdown?: Breakdown } | null>(null);
  const [retry, setRetry] = useState(true);
  const [resend, setResend] = useState(false);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const start = graph.nodes.find((n) => n.type === "start");
  useEffect(() => { api(`/api/fluxos/${flow.id}`, { action: "preview", audience: start?.data?.audience, breakdown: true }).then(setPreview).catch((e) => setErr(e.message)); }, [flow.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = preview?.breakdown;
  const goCount = b ? b.fresh + (retry ? b.failed : 0) + (resend ? b.done : 0) : preview?.total || 0;
  const go = async () => { setBusy(true); setErr(""); try { await onStart(mode === "schedule" && when ? new Date(when).toISOString() : null, { retry_failed: retry, resend_done: resend }); } catch (e: any) { setErr(e.message); setBusy(false); } };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><h2 style={{ margin: 0 }}>Iniciar para o público</h2><button className="btn icon" onClick={onClose}>×</button></div>
        {err && <div className="banner err">{err}</div>}
        {problems.length > 0 && <div className="banner warn"><b>Antes de iniciar, corrija:</b> {problems.join(" · ")}</div>}
        <div className="notice">{preview ? <>
          <b>{fmtInt(preview.total)} contato(s)</b> no público do bloco Início{b ? <>: {fmtInt(b.fresh)} novo(s){b.active ? <> · {fmtInt(b.active)} no meio deste fluxo (não entram de novo)</> : null}{b.done ? <> · {fmtInt(b.done)} já concluíram</> : null}{b.failed ? <> · {fmtInt(b.failed)} falharam ou foram cancelados antes</> : null}{b.optout ? <> · {fmtInt(b.optout)} pediram para não receber</> : null}</> : null}.
          {" "}Eles recebem o primeiro bloco na velocidade escolhida ({start?.data?.rate_per_minute || 60}/min). Testes não contam.
          {preview.sample.length ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Ex.: {preview.sample.slice(0, 5).map((s) => s.name || fmtPhone(s.phone)).join(", ")}</div> : null}
        </> : "Calculando o público…"}</div>
        {b && b.failed > 0 && <label className="check"><input type="checkbox" checked={retry} onChange={(e) => setRetry(e.target.checked)} /> Tentar de novo quem falhou ou foi cancelado antes ({fmtInt(b.failed)})</label>}
        {b && b.done > 0 && <label className="check"><input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} /> Enviar de novo para quem já concluiu este fluxo ({fmtInt(b.done)})</label>}
        {preview && goCount === 0 && !problems.length && <div className="banner warn">Ninguém novo para receber agora.{b?.active ? " Quem está no meio do fluxo continua de onde parou." : ""}{b && (b.done || b.failed) ? " Marque a opção acima para enviar de novo." : ""}</div>}
        <div className="seg" style={{ alignSelf: "start" }}>{([["now", "Agora"], ["schedule", "Agendar"]] as const).map(([k, l]) => <a key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)} style={{ cursor: "pointer" }}>{l}</a>)}</div>
        {mode === "schedule" && <label className="field"><span>Data e hora (horário do seu computador)</span><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>}
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>O fluxo fica ativo: respostas, prazos e esperas continuam sendo processados mesmo com o painel fechado. Você pode pausar a qualquer momento.</p>
        <div className="wizard-foot"><button className="btn" onClick={onClose} disabled={busy}>Cancelar</button><span style={{ flex: 1 }} /><button className="btn primary" onClick={go} disabled={busy || problems.length > 0 || !goCount || (mode === "schedule" && !when)}>{busy ? "Iniciando…" : mode === "now" ? `Iniciar para ${fmtInt(goCount)} contato(s)` : `Agendar para ${fmtInt(goCount)} contato(s)`}</button></div>
      </div>
    </div>
  );
}

export function TestModal({ problems, onClose, onTest }: { problems: string[]; onClose: () => void; onTest: (phone: string) => Promise<void> }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => { setBusy(true); setErr(""); try { await onTest(phone); } catch (e: any) { setErr(e.message); setBusy(false); } };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="panel-head"><h2 style={{ margin: 0 }}>Testar o fluxo</h2><button className="btn icon" onClick={onClose}>×</button></div>
        {err && <div className="banner err">{err}</div>}
        {problems.length > 0 && <div className="banner warn"><b>Antes de testar, corrija:</b> {problems.join(" · ")}</div>}
        <label className="field"><span>Seu WhatsApp</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="85 99999-0000" autoFocus /></label>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>O fluxo roda de verdade para este número (o template é cobrado normalmente). Responda no WhatsApp para ver as próximas etapas — para a resposta avançar, o fluxo precisa estar ativo.</p>
        <div className="wizard-foot"><button className="btn" onClick={onClose} disabled={busy}>Cancelar</button><span style={{ flex: 1 }} /><button className="btn primary" onClick={go} disabled={busy || !phone.trim() || problems.length > 0}>{busy ? "Enviando…" : "Enviar teste"}</button></div>
      </div>
    </div>
  );
}

export function AddModal({ onClose, onAdd }: { onClose: () => void; onAdd: (phones: string, resend: boolean) => Promise<void> }) {
  const [phones, setPhones] = useState("");
  const [resend, setResend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => { setBusy(true); setErr(""); try { await onAdd(phones, resend); } catch (e: any) { setErr(e.message); setBusy(false); } };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="panel-head"><h2 style={{ margin: 0 }}>Adicionar números à fila</h2><button className="btn icon" onClick={onClose}>×</button></div>
        {err && <div className="banner err">{err}</div>}
        <label className="field"><span>Números (um por linha)</span><textarea rows={6} value={phones} onChange={(e) => setPhones(e.target.value)} placeholder={"85 99999-0001\n85 99999-0002"} /></label>
        <label className="check"><input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} /> Enviar de novo para quem já concluiu este fluxo</label>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Entram na fila como se fossem do público do Início (se o fluxo estiver ativo, começam na velocidade configurada). Quem está no meio do fluxo não entra de novo; quem falhou antes tenta de novo.</p>
        <div className="wizard-foot"><button className="btn" onClick={onClose} disabled={busy}>Cancelar</button><span style={{ flex: 1 }} /><button className="btn primary" onClick={go} disabled={busy || !phones.trim()}>{busy ? "Adicionando…" : "Adicionar"}</button></div>
      </div>
    </div>
  );
}

/** Distribuição planejada × real: por número de envio e por template em cada bloco Template do WhatsApp. */
export function Distribution({ loaded, graph, ctx, start }: { loaded: Loaded; graph: Graph; ctx: Ctx; start: FlowNode | null }) {
  const f = loaded.flow;
  const split = phoneSplitOf(start?.data, f.phone_number_id);
  const phoneStats = loaded.stats.phones || [];
  const tplStats = loaded.stats.templates || [];
  const totalRuns = phoneStats.reduce((a, p) => a + p.runs, 0);
  const phoneOf = (pnid: string) => ctx.catalog.phones.find((p) => p.id === pnid);
  const phoneNum = (pnid: string) => phoneOf(pnid)?.display_phone_number || (pnid === f.phone_number_id ? f.display_phone_number : null) || pnid;
  const phoneName = (pnid: string) => phoneOf(pnid)?.verified_name || (pnid === f.phone_number_id ? f.phone_name : null) || "";
  const phoneIds = [...new Set([...split.map((p) => p.id), ...phoneStats.map((p) => p.phone_number_id)])];
  const tplNodes = graph.nodes.filter((n) => n.type === "template");
  const entered = new Map(loaded.stats.nodes.map((n) => [n.node_id, n.entered]));
  const showPhones = phoneIds.length > 1;
  const showTemplates = tplNodes.some((n) => groupOf(n.data).length > 0) || tplStats.length > 0;
  if (!showPhones && !showTemplates) return null;
  const pctCell = (real: number | null, planned: number | null, n: number) => {
    if (real == null) return <td className="num muted">—</td>;
    const off = planned != null && n >= 20 && Math.abs(real - planned) > 5;
    return <td className="num" style={off ? { color: "var(--serious)", fontWeight: 600 } : undefined} title={off ? `Diferença de ${(real - planned!).toFixed(1).replace(".", ",")} p.p. em relação ao planejado` : undefined}>{fmtPct(real / 100)}</td>;
  };
  return (
    <div className="dist">
      {showPhones && (
        <div className="card dist-card">
          <div className="dist-head"><b>Distribuição por número</b><span className="muted">{totalRuns ? `${fmtInt(totalRuns)} contato(s) distribuídos` : "ainda sem contatos: a coluna Planejado mostra a divisão configurada no Início"}</span></div>
          <div className="table-wrap">
            <table className="dist-table">
              <thead><tr><th>Número</th><th className="num">Planejado</th><th className="num">Contatos</th><th className="num">Real</th><th className="num">Enviados</th><th className="num">Entregues</th><th className="num">Lidos</th><th className="num">Falhas</th><th>Qualidade</th></tr></thead>
              <tbody>
                {phoneIds.map((pnid) => {
                  const plan = split.find((p) => p.id === pnid)?.pct ?? null;
                  const s = phoneStats.find((p) => p.phone_number_id === pnid);
                  const q = phoneOf(pnid)?.quality_rating;
                  const fails = s ? s.failed + s.undelivered : 0;
                  return (
                    <tr key={pnid}>
                      <td><b className="num">{phoneNum(pnid)}</b>{phoneName(pnid) ? <div className="muted" style={{ fontSize: 12 }}>{phoneName(pnid)}</div> : null}</td>
                      <td className="num">{plan != null ? `${plan}%` : <span className="muted" title="Número fora da divisão atual do Início">—</span>}</td>
                      <td className="num">{s ? fmtInt(s.runs) : "—"}</td>
                      {pctCell(s && totalRuns ? (s.runs * 100) / totalRuns : null, plan, totalRuns)}
                      <td className="num">{s ? fmtInt(s.sent) : "—"}</td>
                      <td className="num">{s ? fmtInt(s.delivered) : "—"}</td>
                      <td className="num">{s ? fmtInt(s.read) : "—"}</td>
                      <td className="num" style={fails ? { color: "var(--critical)" } : undefined}>{s ? fmtInt(fails) : "—"}</td>
                      <td>{q ? <span className={`pill ${q === "GREEN" ? "good" : q === "YELLOW" ? "warning" : q === "RED" ? "critical" : "neutral"}`}><i aria-hidden />{QUALITY_LABEL[q] || q}</span> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showTemplates && tplNodes.map((n) => {
        const d = n.data || {};
        const group = groupOf(d);
        const planned = new Map<string, number>();
        if (group.length) { for (const [tid, v] of estimateGroup(100, split, group).per) planned.set(tid, v); }
        else if (d.template_id) planned.set(String(d.template_id), 100);
        const rows = tplStats.filter((r) => r.node_id === n.id);
        if (!planned.size && !rows.length) return null;
        type Agg = { template_id: string; name: string; category: string | null; sent: number; errors: number; delivered: number; read: number; undelivered: number; byPhone: Map<string, number> };
        const agg = new Map<string, Agg>();
        const ensure = (tid: string) => {
          let a = agg.get(tid);
          if (!a) { const t = ctx.templates.find((x) => x.id === tid); a = { template_id: tid, name: t?.name || tid, category: t?.category ?? null, sent: 0, errors: 0, delivered: 0, read: 0, undelivered: 0, byPhone: new Map() }; agg.set(tid, a); }
          return a;
        };
        for (const tid of planned.keys()) ensure(tid);
        for (const r of rows) {
          const a = ensure(r.template_id);
          if (a.name === r.template_id && r.template_name) a.name = r.template_name;
          if (!a.category && r.category) a.category = r.category;
          a.sent += r.sent; a.errors += r.errors; a.delivered += r.delivered; a.read += r.read; a.undelivered += r.undelivered;
          if (r.sent) a.byPhone.set(r.phone_number_id, (a.byPhone.get(r.phone_number_id) || 0) + r.sent);
        }
        const nodeSent = [...agg.values()].reduce((s, a) => s + a.sent, 0);
        const nodeTries = [...agg.values()].reduce((s, a) => s + a.sent + a.errors, 0); // tentativas = o que o randomizador distribuiu
        const base = entered.get(n.id) || totalRuns;
        const list = [...agg.values()].sort((a, b) => (planned.get(b.template_id) || 0) - (planned.get(a.template_id) || 0) || b.sent - a.sent);
        const cats = new Set(list.map((a) => a.category || "?"));
        return (
          <div key={n.id} className="card dist-card">
            <div className="dist-head">
              <b>{group.length ? "Randomizador de templates" : "Template"} · {d.title || NODE_LABEL.template}</b>
              <span className="muted">{group.length ? `${group.length} template(s)` : "1 template"}{nodeSent ? ` · ${fmtInt(nodeSent)} envio(s)` : ""}{cats.size > 1 ? " · categorias misturadas" : ""}</span>
            </div>
            <div className="table-wrap">
              <table className="dist-table">
                <thead><tr><th>Template</th><th>Categoria</th><th className="num">Planejado</th><th className="num">Enviados</th><th className="num" title="Proporção das tentativas (enviados + erros na API) que coube a este template">Real</th><th className="num">Entregues</th><th className="num">Lidos</th><th className="num">Falhas</th></tr></thead>
                <tbody>
                  {list.map((a) => {
                    const plan = planned.get(a.template_id) ?? null;
                    const fails = a.errors + a.undelivered;
                    return (
                      <tr key={a.template_id}>
                        <td><b>{a.name}</b>{plan == null && <div className="muted" style={{ fontSize: 12 }}>fora da configuração atual do bloco</div>}</td>
                        <td><CatPill category={a.category} /></td>
                        <td className="num">{plan != null ? <>{fmtPct(plan / 100)}{base ? <span className="muted" style={{ fontSize: 12 }}> ≈ {fmtInt(Math.round((base * plan) / 100))}</span> : null}</> : "—"}</td>
                        <td className="num">{fmtInt(a.sent)}{a.byPhone.size > 1 && <div className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{[...a.byPhone.entries()].map(([p, k]) => `${phoneNum(p)}: ${fmtInt(k)}`).join(" · ")}</div>}</td>
                        {pctCell(nodeTries ? ((a.sent + a.errors) * 100) / nodeTries : null, plan, nodeTries)}
                        <td className="num">{fmtInt(a.delivered)}</td>
                        <td className="num">{fmtInt(a.read)}</td>
                        <td className="num" style={fails ? { color: "var(--critical)" } : undefined}>{fmtInt(fails)}{a.errors ? <span className="muted" style={{ fontSize: 11 }}> ({fmtInt(a.errors)} na API)</span> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>Planejado = o que está configurado no fluxo · Real = proporção que de fato coube a cada número (contatos) e a cada template (tentativas de envio). Entregues e lidos dependem das confirmações que a Meta envia ao webhook. Falhas somam erros na API e mensagens não entregues. Um valor em laranja indica diferença acima de 5 pontos em relação ao planejado.</p>
    </div>
  );
}

export function RunsPanel({ id, loaded, reload, canEdit, act, graph, ctx, start }: { id: number; loaded: Loaded; reload: () => Promise<any>; canEdit: boolean; act: (a: string, extra?: any, ok?: string) => Promise<any>; graph: Graph; ctx: Ctx; start: FlowNode | null }) {
  const [filter, setFilter] = useState({ rstatus: "", q: "" });
  const [open, setOpen] = useState<number | null>(null);
  const [rows, setRows] = useState<any[]>(loaded.runs || []);
  const [total, setTotal] = useState(loaded.runsTotal || 0);
  useEffect(() => { setRows(loaded.runs || []); setTotal(loaded.runsTotal || 0); }, [loaded]);
  useEffect(() => {
    const q = new URLSearchParams({ runs: "1" }); if (filter.rstatus) q.set("rstatus", filter.rstatus); if (filter.q) q.set("q", filter.q);
    const t = setTimeout(() => api(`/api/fluxos/${id}?${q}`).then((j) => { setRows(j.runs); setTotal(j.runsTotal); }).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [filter, id]);
  const c = loaded.stats.counts;
  const nodeName = (nid: string | null) => { const n = graph.nodes.find((x) => x.id === nid); return n ? (n.data?.title || NODE_LABEL[n.type]) : "—"; };
  return (
    <>
      <div className="kv flow-kv" style={{ marginTop: 0 }}>
        <div><b>{fmtInt(c.queued || 0)}</b><span>na fila</span></div>
        <div><b>{fmtInt((c.running || 0))}</b><span>em andamento</span></div>
        <div><b>{fmtInt((c.waiting_reply || 0))}</b><span>aguardando resposta</span></div>
        <div><b>{fmtInt((c.waiting_time || 0))}</b><span>aguardando prazo</span></div>
        <div><b>{fmtInt(c.done || 0)}</b><span>concluídos</span></div>
        <div><b style={{ color: (c.failed || 0) + (c.stopped || 0) ? "var(--critical)" : undefined }}>{fmtInt((c.failed || 0) + (c.stopped || 0))}</b><span>falhas / interrompidos</span></div>
      </div>
      <Distribution loaded={loaded} graph={graph} ctx={ctx} start={start} />
      <div className="toolbar" style={{ marginTop: 12 }}>
        <select value={filter.rstatus} onChange={(e) => setFilter({ ...filter, rstatus: e.target.value })}><option value="">Todos os status</option>{Object.entries(RUN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input type="search" placeholder="Buscar nome ou telefone" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} style={{ minWidth: 220 }} />
        <span className="muted" style={{ fontSize: 12 }}>{fmtInt(total)} execução(ões){c.tests ? ` · ${fmtInt(c.tests)} de teste` : ""} · clique numa linha para ver os detalhes</span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={reload}>Atualizar</button>
        {canEdit && ((c.queued || 0) + (c.waiting_reply || 0) + (c.waiting_time || 0) > 0) && <button className="btn" onClick={() => confirm("Cancelar todas as execuções na fila ou aguardando?") && act("cancel_runs", {}, "Execuções canceladas.")}>Cancelar pendentes</button>}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Contato</th><th>Status</th><th>Última mensagem</th><th>Bloco atual</th><th>Última resposta</th><th>Próximo passo</th><th>Atualizado</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                <tr onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: "pointer" }} title="Clique para ver tudo o que aconteceu nesta execução">
                  <td><b>{r.contact_name || fmtPhone(r.phone)}</b>{r.is_test && <span className="chip muted" style={{ marginLeft: 6 }}>teste</span>}{r.vars?.trigger === "message" && <span className="chip muted" style={{ marginLeft: 6 }} title="Iniciou sozinho: o contato mandou mensagem">gatilho</span>}<div className="muted" style={{ fontSize: 12 }}>{fmtPhone(r.phone)}</div></td>
                  <td><span className={`pill ${RUN_TONE[r.status] || "neutral"}`}><i aria-hidden />{RUN_STATUS[r.status] || r.status}</span>{r.last_error && <div className="muted run-err" title={r.last_error}>{r.last_error}</div>}</td>
                  <td>{r.msg_status ? <><span className={`pill ${MSG_TONE[r.msg_status] || "neutral"}`}><i aria-hidden />{MSG_LABEL[r.msg_status] || r.msg_status}</span>{r.msg_status === "failed" && <div className="muted" style={{ fontSize: 11, color: "var(--critical)", maxWidth: 220 }} title={failText(r.msg_error_code, r.msg_error_title)}>{failShort(r.msg_error_code, r.msg_error_title)}</div>}{r.msg_template && <div className="muted" style={{ fontSize: 11 }}>{r.msg_template}</div>}</> : <span className="muted">—</span>}</td>
                  <td>{nodeName(r.node_id)}</td>
                  <td className="muted" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.vars?.last_reply || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.status === "waiting_time" && r.next_at ? `continua ${fmtDateTime(r.next_at)}` : r.status === "waiting_reply" ? (r.wait_until ? `até ${fmtDateTime(r.wait_until)}` : "sem prazo") : r.status === "queued" && r.next_at ? `agendado ${fmtDateTime(r.next_at)}` : "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{fmtDateTime(r.updated_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}><div className="row-actions">
                    {r.conversation_id && <Link className="btn" href={`/atendimento?c=${r.conversation_id}`}>Conversa</Link>}
                    {canEdit && ["queued", "waiting_reply", "waiting_time", "running"].includes(r.status) && <button className="btn" onClick={() => act("cancel_runs", { run_ids: [r.id] }, "Execução cancelada.")}>Cancelar</button>}
                    {canEdit && ["done", "failed", "cancelled", "stopped"].includes(r.status) && <button className="btn" onClick={() => act("restart_run", { run_id: r.id }, "Execução reiniciada do começo.")}>Reiniciar</button>}
                  </div></td>
                </tr>
                {open === r.id && <tr className="run-detail"><td colSpan={8}><RunTimeline flowId={id} runId={r.id} graph={graph} /></td></tr>}
                </Fragment>
              ))}
              {!rows.length && <tr><td colSpan={8} className="muted">Nenhuma execução ainda. Use “Iniciar” ou “Testar” na barra do fluxo.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
