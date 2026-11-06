"use client";
import { isManagerRole } from "@/lib/roles";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fmtDateTime, fmtInt, fmtMoney, fmtPct, CATEGORY_LABEL, LIMIT_LABEL, QUALITY_LABEL } from "@/lib/format";
import { placeholdersOf, previewFor, type Mapping, type ParamSource, type Placeholders } from "@/lib/template-vars";
import { ImportModal } from "@/components/Contacts";
import { loadCatalog } from "@/lib/catalog-client";

export type Catalog = {
  departments: { id: number; name: string }[]; tags: { id: number; name: string; color: string | null }[];
  lists: { id: number; name: string; total: number; waba_id: string | null }[];
  phones: { id: string; waba_id: string; display_phone_number: string; verified_name: string | null; quality_rating: string | null; messaging_limit: string | null; label?: string | null }[];
  wabas: { id: string; name: string | null }[];
  templates: { id: string; waba_id: string; name: string; language: string; category: string | null; components: any[] | null }[];
  me: { id: number; role: string };
};
export type Counts = { pending: number; sending: number; sent: number; delivered: number; read: number; failed: number; skipped: number; replied: number; billable: number };
export type CampaignRow = {
  id: number; name: string; waba_id: string; phone_number_id: string; template_name: string; template_category: string | null; status: string;
  scheduled_at: string | null; rate_per_minute: number; total: number; last_error: string | null; created_at: string; started_at: string | null; finished_at: string | null;
  counts: Counts; display_phone_number: string | null; phone_name: string | null; waba_name: string | null; created_by_name: string | null;
};

export const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", scheduled: "Agendado", running: "Enviando", paused: "Pausado", done: "Concluído", cancelled: "Cancelado" };
export const STATUS_TONE: Record<string, string> = { draft: "neutral", scheduled: "warning", running: "good", paused: "serious", done: "neutral", cancelled: "critical" };
export const RATE_OPTIONS = [{ v: 30, l: "Devagar (30/min)" }, { v: 60, l: "Moderada (60/min)" }, { v: 120, l: "Normal (120/min)" }, { v: 300, l: "Rápida (300/min)" }, { v: 600, l: "Máxima (600/min)" }];

export async function api(url: string, body?: any) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ? `${j.error}${j.details ? ` — ${j.details}` : ""}` : `Erro ${r.status}`);
  return j;
}
export const fmtPhone = (p: string) => (p.length === 13 && p.startsWith("55") ? `+55 ${p.slice(2, 4)} ${p.slice(4, 9)}-${p.slice(9)}` : p.length === 12 && p.startsWith("55") ? `+55 ${p.slice(2, 4)} ${p.slice(4, 8)}-${p.slice(8)}` : `+${p}`);

export function done(c: Counts) { return c.sent + c.delivered + c.read + c.failed + c.skipped; }
export function Progress({ c, total }: { c: Counts; total: number }) {
  const ok = c.sent + c.delivered + c.read, bad = c.failed + c.skipped;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : "0%");
  return (
    <div className="prog" title={`${fmtInt(ok)} enviados · ${fmtInt(bad)} falhas/pulados · ${fmtInt(c.pending + c.sending)} na fila`}>
      <div className="prog-track"><div className="prog-ok" style={{ width: pct(ok) }} /><div className="prog-bad" style={{ width: pct(bad) }} /></div>
      <span className="muted">{fmtInt(done(c))}/{fmtInt(total)}</span>
    </div>
  );
}

export default function Campaigns() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [filter, setFilter] = useState({ status: "", waba: "" });
  const [wizard, setWizard] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { loadCatalog<Catalog>(setCatalog, (e) => setErr(e.message)); }, []);
  const [presetList, setPresetList] = useState<number | null>(null);
  useEffect(() => { const l = Number(new URLSearchParams(window.location.search).get("lista") || 0); if (l) { setPresetList(l); setWizard(true); } }, []);
  const load = useCallback(() => {
    const q = new URLSearchParams(); if (filter.status) q.set("status", filter.status); if (filter.waba) q.set("waba", filter.waba);
    return api(`/api/campanhas?${q}`).then((j) => setRows(j.rows)).catch((e) => setErr(e.message));
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  const live = rows.some((r) => r.status === "running" || r.status === "scheduled");
  useEffect(() => { if (!live) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [live, load]);

  const act = async (id: number, action: string) => {
    setErr(""); try { await api(`/api/campanhas/${id}`, { action }); await load(); } catch (e: any) { setErr(e.message); }
  };
  const canEdit = isManagerRole(catalog?.me.role);
  const totals = useMemo(() => rows.reduce((a, r) => ({ sent: a.sent + r.counts.sent + r.counts.delivered + r.counts.read, replied: a.replied + r.counts.replied, failed: a.failed + r.counts.failed }), { sent: 0, replied: 0, failed: 0 }), [rows]);

  return (
    <>
      <div className="toolbar">
        <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">Todos os status</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={filter.waba} onChange={(e) => setFilter({ ...filter, waba: e.target.value })}><option value="">Todas as contas</option>{catalog?.wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}</select>
        <span className="muted" style={{ fontSize: 13 }}>{fmtInt(totals.sent)} enviados · {fmtInt(totals.replied)} respostas · {fmtInt(totals.failed)} falhas</span>
        <span style={{ flex: 1 }} />
        {canEdit && <button className="btn primary" onClick={() => setWizard(true)}>Novo disparo</button>}
      </div>
      {err && <div className="banner err">{err}</div>}
      {msg && <div className="banner">{msg}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Disparo</th><th>Status</th><th>Progresso</th><th>Entregues</th><th>Lidos</th><th>Respostas</th><th>Falhas</th><th>Criado</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const c = r.counts, ok = c.sent + c.delivered + c.read;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/disparos/${r.id}`}><b>{r.name}</b></Link>
                      <div className="muted" style={{ fontSize: 12 }}>{r.template_name} · {r.phone_name || r.display_phone_number || "número"}{r.waba_name ? ` · ${r.waba_name}` : ""}</div>
                    </td>
                    <td>
                      <span className={`pill ${STATUS_TONE[r.status]}`}><i aria-hidden />{STATUS_LABEL[r.status] || r.status}</span>
                      {r.status === "scheduled" && r.scheduled_at && <div className="muted" style={{ fontSize: 11 }}>{fmtDateTime(r.scheduled_at)}</div>}
                      {r.last_error && <div className="muted" style={{ fontSize: 11, color: "var(--critical)" }}>{r.last_error}</div>}
                    </td>
                    <td><Progress c={c} total={r.total} /></td>
                    <td>{ok ? fmtPct((c.delivered + c.read) / ok) : "—"}</td>
                    <td>{ok ? fmtPct(c.read / ok) : "—"}</td>
                    <td>{fmtInt(c.replied)}{ok ? <span className="muted"> ({fmtPct(c.replied / ok)})</span> : null}</td>
                    <td>{c.failed + c.skipped ? <span style={{ color: "var(--critical)" }}>{fmtInt(c.failed + c.skipped)}</span> : "0"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{fmtDateTime(r.created_at)}<br />{r.created_by_name || ""}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn" href={`/disparos/${r.id}`}>Abrir</Link>
                        {canEdit && r.status === "running" && <button className="btn" onClick={() => act(r.id, "pause")}>Pausar</button>}
                        {canEdit && (r.status === "paused" || r.status === "draft") && <button className="btn" onClick={() => act(r.id, "start")}>{r.status === "paused" ? "Retomar" : "Iniciar"}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={9} className="muted">Nenhum disparo ainda. {canEdit ? "Clique em \"Novo disparo\" para criar o primeiro." : ""}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {wizard && catalog && <Wizard catalog={catalog} presetList={presetList} onClose={() => setWizard(false)} onCreated={(m) => { setWizard(false); setMsg(m); load(); loadCatalog<Catalog>(setCatalog); }} />}
    </>
  );
}

// ---------------- assistente de novo disparo ----------------

type Aud = { scope: "lists" | "tags" | "all" | "phones"; list_ids: number[]; tag_ids: number[]; department_id: string; waba_only: boolean; other_accounts?: boolean; exclude_tag_ids: number[]; exclude_recent_days: number; exclude_campaign_ids: number[]; only_replied: boolean; phones_text: string };
type Opts = { fields: { value: string; label: string }[]; campaigns: { id: number; name: string; status: string; total: number }[] };

const SAMPLE = { name: "Maria Souza", phone: "5585999990000", email: "maria@exemplo.com", fields: {} as Record<string, any> };

function Wizard({ catalog: initial, presetList, onClose, onCreated }: { catalog: Catalog; presetList?: number | null; onClose: () => void; onCreated: (msg: string) => void }) {
  const [catalog, setCatalog] = useState(initial);
  const [note, setNote] = useState("");
  const [step, setStep] = useState(1);
  const [opts, setOpts] = useState<Opts>({ fields: [], campaigns: [] });
  const [form, setForm] = useState({ name: "", waba_id: catalog.wabas[0]?.id || "", phone_number_id: "", template_id: "", rate_per_minute: 120 });
  const [mapping, setMapping] = useState<{ header: any; body: ParamSource[]; buttons: { index: number; sub_type: "url" | "copy_code"; source: ParamSource }[] }>({ header: null, body: [], buttons: [] });
  const [aud, setAud] = useState<Aud>({ scope: "lists", list_ids: presetList ? [presetList] : [], tag_ids: [], department_id: "", waba_only: false, exclude_tag_ids: [], exclude_recent_days: 0, exclude_campaign_ids: [], only_replied: false, phones_text: "" });
  const [preview, setPreview] = useState<{ total: number; sample: { phone: string; name: string | null }[]; unit_cost: number | null; estimate: number | null } | null>(null);
  const [start, setStart] = useState<"now" | "schedule" | "draft">("now");
  const [when, setWhen] = useState("");
  const [test, setTest] = useState({ phone: "", msg: "" });
  const [imp, setImp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api("/api/campanhas", { action: "options" }).then(setOpts).catch(() => {}); }, []);

  const phones = catalog.phones.filter((p) => p.waba_id === form.waba_id);
  const templates = catalog.templates.filter((t) => t.waba_id === form.waba_id && t.category !== "AUTHENTICATION");
  // público: só listas desta conta (ou sem conta) e quantos contatos desta conta há em cada lista/tag
  const [counts, setCounts] = useState<{ total: number; lists: Record<string, number>; tags: Record<string, number> } | null>(null);
  useEffect(() => { if (!form.waba_id) return; setCounts(null); api(`/api/contatos/resumo?waba=${encodeURIComponent(form.waba_id)}`).then(setCounts).catch(() => {}); }, [form.waba_id]);
  const accountLists = catalog.lists.filter((l: any) => aud.other_accounts || !l.waba_id || l.waba_id === form.waba_id || aud.list_ids.includes(l.id));
  const cnt = (m: Record<string, number> | undefined, id: number) => (counts && !aud.other_accounts ? m?.[id] ?? 0 : null);
  const tpl = templates.find((t) => t.id === form.template_id) || null;
  const ph: Placeholders = useMemo(() => placeholdersOf(tpl?.components), [tpl]);
  const bodyText = (tpl?.components || []).find((c: any) => c?.type === "BODY")?.text || "";
  const sampleContact = preview?.sample?.[0] ? { ...SAMPLE, ...preview.sample[0] } : SAMPLE;
  const fullMapping: Mapping = { header: mapping.header, body: mapping.body, buttons: mapping.buttons };

  useEffect(() => { if (!phones.find((p) => p.id === form.phone_number_id)) setForm((f) => ({ ...f, phone_number_id: phones[0]?.id || "" })); }, [form.waba_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // ao trocar de template, recria o mapeamento com um palpite por variável
    const guess = (key: string): ParamSource => ({ key, kind: "field", value: "first_name", fallback: "cliente" });
    setMapping({
      header: ph.header.kind === "text" && ph.header.keys.length ? { kind: "text", source: guess(ph.header.keys[0]) } : null,
      body: ph.body.map((k, i) => (i === 0 ? guess(k) : { key: k, kind: "text", value: "", fallback: "" })),
      buttons: ph.buttons.map((b) => ({ index: b.index, sub_type: b.sub_type, source: { key: `btn${b.index}`, kind: "text", value: "", fallback: "" } })),
    });
  }, [form.template_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewTimer = useRef<any>(null);
  useEffect(() => {
    if (step !== 3 && step !== 4) return;
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      api("/api/campanhas", { action: "preview", audience: aud, waba_id: form.waba_id, template_id: form.template_id }).then(setPreview).catch((e) => setErr(e.message));
    }, 400);
  }, [aud, step, form.waba_id, form.template_id]);

  const setBody = (key: string, patch: Partial<ParamSource>) => setMapping((m) => ({ ...m, body: m.body.map((b) => (b.key === key ? { ...b, ...patch } : b)) }));
  const toggle = (arr: number[], id: number) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const uploadHeader = async (file: File) => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData(); fd.set("file", file); fd.set("phone_number_id", form.phone_number_id);
      const r = await fetch("/api/media/upload", { method: "POST", body: fd });
      const up = await r.json(); if (!r.ok) throw new Error(up.error || "Falha no upload");
      setMapping((m) => ({ ...m, header: { kind: ph.header.kind, media_id: up.id, filename: up.filename } }));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const sendTest = async () => {
    setBusy(true); setErr(""); setTest((t) => ({ ...t, msg: "" }));
    try {
      const j = await api("/api/campanhas", { action: "test", phone: test.phone, template_id: form.template_id, phone_number_id: form.phone_number_id, mapping: fullMapping });
      setTest((t) => ({ ...t, msg: `Teste enviado para ${fmtPhone(test.phone.replace(/\D/g, ""))}: "${j.preview}"` }));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true); setErr("");
    try {
      const j = await api("/api/campanhas", { action: "create", ...form, mapping: fullMapping, audience: aud, start, scheduled_at: when ? new Date(when).toISOString() : null });
      onCreated(start === "now" ? `Disparo "${form.name}" iniciado para ${fmtInt(j.total)} contato(s).` : start === "schedule" ? `Disparo "${form.name}" agendado para ${fmtDateTime(new Date(when).toISOString())} (${fmtInt(j.total)} contatos).` : `Rascunho "${form.name}" salvo com ${fmtInt(j.total)} contato(s).`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  const step1ok = form.name.trim() && form.phone_number_id && form.template_id;
  const step2ok = ph.body.every((k) => { const b = mapping.body.find((x) => x.key === k); return b && (b.kind === "text" ? b.value.trim() : b.value || b.fallback); })
    && (ph.header.kind === "none" || ph.header.kind === "text" || ph.header.kind === "location" || mapping.header?.media_id)
    && ph.buttons.every((b) => { const m = mapping.buttons.find((x) => x.index === b.index); return m && (m.source.value || m.source.fallback); });
  const step3ok = (preview?.total || 0) > 0;

  const SourcePicker = ({ src, onChange }: { src: ParamSource; onChange: (p: Partial<ParamSource>) => void }) => (
    <div className="src-row">
      <select value={src.kind === "text" ? "text" : src.value} onChange={(e) => (e.target.value === "text" ? onChange({ kind: "text", value: "" }) : onChange({ kind: "field", value: e.target.value }))}>
        {opts.fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        <option value="text">Texto fixo</option>
      </select>
      {src.kind === "text"
        ? <input placeholder="Texto que vai no lugar da variável" value={src.value} onChange={(e) => onChange({ value: e.target.value })} />
        : <input placeholder="Se o contato não tiver (ex.: cliente)" value={src.fallback || ""} onChange={(e) => onChange({ fallback: e.target.value })} title="Usado quando o campo do contato estiver vazio" />}
    </div>
  );

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wizard" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><h2 style={{ margin: 0 }}>Novo disparo</h2><button className="btn icon" onClick={onClose}>×</button></div>
        <div className="wizard-steps">
          {["Mensagem", "Variáveis", "Público", "Revisão"].map((l, i) => <span key={l} className={`wstep ${step === i + 1 ? "on" : step > i + 1 ? "done" : ""}`} onClick={() => step > i + 1 && setStep(i + 1)}>{i + 1}. {l}</span>)}
        </div>
        {err && <div className="banner err">{err}</div>}
        {note && <div className="banner">{note}</div>}

        {step === 1 && (
          <div className="grid" style={{ gap: 12 }}>
            <label className="field"><span>Nome do disparo</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex.: Promoção de outubro — leads do site" autoFocus /></label>
            <div className="kv-row">
              <label className="field"><span>Conta</span><select value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value, template_id: "" })}>{catalog.wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}</select></label>
              <label className="field"><span>Número de envio</span><select value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })}>{phones.map((p) => <option key={p.id} value={p.id}>{p.label ? `${p.label} · ` : ""}{p.verified_name || p.display_phone_number} ({p.display_phone_number})</option>)}{!phones.length && <option value="">Nenhum número nesta conta</option>}</select></label>
            </div>
            <label className="field"><span>Template aprovado</span>
              <select value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}>
                <option value="">Escolha…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {CATEGORY_LABEL[t.category || ""] || t.category || "—"} · {t.language}</option>)}
              </select>
            </label>
            {tpl && <div className="tpl-preview"><div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{ph.header.kind !== "none" ? `Cabeçalho: ${ph.header.kind === "text" ? "texto" : ph.header.kind}` : "Sem cabeçalho"}{ph.buttons.length ? ` · ${ph.buttons.length} botão(ões) com variável` : ""}</div><div className="bubble preview"><div className="bubble-text">{bodyText || "(template sem corpo de texto)"}</div></div></div>}
            <label className="field"><span>Velocidade de envio</span><select value={form.rate_per_minute} onChange={(e) => setForm({ ...form, rate_per_minute: Number(e.target.value) })}>{RATE_OPTIONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select></label>
            {(() => { const pn = phones.find((p) => p.id === form.phone_number_id); return pn ? <p className="muted" style={{ fontSize: 12, margin: 0 }}>Este número: qualidade <b>{QUALITY_LABEL[pn.quality_rating || "UNKNOWN"] || pn.quality_rating}</b>{pn.messaging_limit ? <> · pode iniciar até <b>{LIMIT_LABEL[pn.messaging_limit] || pn.messaging_limit}</b> de conversas com contatos únicos</> : null}. Qualidade baixa ou limite pequeno: prefira velocidade moderada.</p> : null; })()}
          </div>
        )}

        {step === 2 && tpl && (
          <div className="grid" style={{ gap: 12 }}>
            {ph.header.kind !== "none" && ph.header.kind !== "text" && ph.header.kind !== "location" && (
              <div className="field"><span>Cabeçalho ({ph.header.kind === "image" ? "imagem" : ph.header.kind === "video" ? "vídeo" : "documento"}) — o mesmo arquivo para todos</span>
                <div className="src-row">
                  <input ref={fileRef} type="file" accept={ph.header.kind === "image" ? "image/jpeg,image/png" : ph.header.kind === "video" ? "video/mp4" : "application/pdf,.pdf,.doc,.docx,.xls,.xlsx"} onChange={(e) => e.target.files?.[0] && uploadHeader(e.target.files[0])} disabled={busy} />
                  <span className="muted">{mapping.header?.media_id ? `✓ ${mapping.header.filename || "arquivo enviado"}` : "nenhum arquivo"}</span>
                </div>
              </div>
            )}
            {ph.header.kind === "text" && ph.header.keys.length > 0 && mapping.header?.kind === "text" && (
              <div className="field"><span>Cabeçalho — variável {`{{${ph.header.keys[0]}}}`}</span><SourcePicker src={mapping.header.source} onChange={(p) => setMapping((m) => ({ ...m, header: { kind: "text", source: { ...m.header.source, ...p } } }))} /></div>
            )}
            {ph.body.map((k) => {
              const src = mapping.body.find((b) => b.key === k)!;
              return <div className="field" key={k}><span>Corpo — variável {`{{${k}}}`}</span><SourcePicker src={src} onChange={(p) => setBody(k, p)} /></div>;
            })}
            {ph.buttons.map((b) => {
              const m = mapping.buttons.find((x) => x.index === b.index)!;
              return <div className="field" key={b.index}><span>Botão "{b.text}" — {b.sub_type === "url" ? "parte variável do link" : "código do cupom"}</span><SourcePicker src={m.source} onChange={(p) => setMapping((mm) => ({ ...mm, buttons: mm.buttons.map((x) => (x.index === b.index ? { ...x, source: { ...x.source, ...p } } : x)) }))} /></div>;
            })}
            {!ph.body.length && ph.header.kind === "none" && !ph.buttons.length && <p className="muted">Este template não tem variáveis: a mensagem vai igual para todos.</p>}
            <div className="tpl-preview"><div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Prévia com um contato de exemplo</div><div className="bubble preview"><div className="bubble-text">{previewFor(tpl.components, ph, fullMapping, sampleContact)}</div></div></div>
            <div className="field"><span>Enviar um teste antes (opcional)</span>
              <div className="src-row"><input placeholder="Seu WhatsApp, ex.: 85 99999-0000" value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} /><button className="btn" onClick={sendTest} disabled={busy || !test.phone || !step2ok}>Enviar teste</button></div>
              {test.msg && <span className="ok" style={{ fontSize: 12 }}>{test.msg}</span>}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid" style={{ gap: 12 }}>
            <div className="seg" style={{ alignSelf: "start" }}>
              {([["lists", "Listas"], ["tags", "Tags"], ["all", "Todos desta conta"], ["phones", "Números avulsos"]] as const).map(([k, l]) => <a key={k} className={aud.scope === k ? "on" : ""} onClick={() => setAud({ ...aud, scope: k })} style={{ cursor: "pointer" }}>{l}</a>)}
            </div>
            {aud.scope === "lists" && (
              <div className="field"><span>Listas (qualquer uma)</span>
                <div className="chips">{accountLists.map((l) => <button key={l.id} type="button" className={`chip pick ${aud.list_ids.includes(l.id) ? "on" : ""}`} onClick={() => setAud({ ...aud, list_ids: toggle(aud.list_ids, l.id) })}>{l.name} ({fmtInt(cnt(counts?.lists, l.id) ?? l.total)})</button>)}{!accountLists.length && <span className="muted">Nenhuma lista desta conta ainda — crie em Leads ou em Contatos.</span>}</div>
                <div><button className="link" type="button" onClick={() => setImp(true)}>Importar uma planilha como nova lista</button></div>
              </div>
            )}
            {aud.scope === "tags" && (
              <div className="field"><span>Tags (qualquer uma)</span>
                <div className="chips">{catalog.tags.map((t) => { const k = cnt(counts?.tags, t.id); return <button key={t.id} type="button" className={`chip pick ${aud.tag_ids.includes(t.id) ? "on" : ""}`} onClick={() => setAud({ ...aud, tag_ids: toggle(aud.tag_ids, t.id) })}>{t.name}{k != null ? ` (${fmtInt(k)})` : ""}</button>; })}{!catalog.tags.length && <span className="muted">Nenhuma tag ainda — crie em Contatos ou em Leads.</span>}</div>
              </div>
            )}
            {aud.scope === "phones" && (
              <label className="field"><span>Cole os números (um por linha ou separados por vírgula; DDD + número, o 55 é adicionado)</span><textarea rows={6} value={aud.phones_text} onChange={(e) => setAud({ ...aud, phones_text: e.target.value })} placeholder={"85 99999-0001\n85 99999-0002"} /></label>
            )}
            <div className="kv-row">
              <label className="field"><span>Só do departamento</span><select value={aud.department_id} onChange={(e) => setAud({ ...aud, department_id: e.target.value })}><option value="">Qualquer</option>{catalog.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
              <label className="field"><span>Não enviar para quem recebeu mensagem nos últimos</span><select value={aud.exclude_recent_days} onChange={(e) => setAud({ ...aud, exclude_recent_days: Number(e.target.value) })}><option value={0}>Sem restrição</option><option value={1}>1 dia</option><option value={3}>3 dias</option><option value={7}>7 dias</option><option value={15}>15 dias</option><option value={30}>30 dias</option></select></label>
            </div>
            {catalog.tags.length > 0 && <div className="field"><span>Excluir quem tem a tag</span><div className="chips">{catalog.tags.map((t) => <button key={t.id} type="button" className={`chip pick ${aud.exclude_tag_ids.includes(t.id) ? "on" : ""}`} onClick={() => setAud({ ...aud, exclude_tag_ids: toggle(aud.exclude_tag_ids, t.id) })}>{t.name}</button>)}</div></div>}
            {opts.campaigns.length > 0 && <div className="field"><span>Excluir quem já estava em outro disparo</span><div className="chips">{opts.campaigns.slice(0, 12).map((c) => <button key={c.id} type="button" className={`chip pick ${aud.exclude_campaign_ids.includes(c.id) ? "on" : ""}`} onClick={() => setAud({ ...aud, exclude_campaign_ids: toggle(aud.exclude_campaign_ids, c.id) })}>{c.name}</button>)}</div></div>}
            <label className="check"><input type="checkbox" checked={aud.only_replied} onChange={(e) => setAud({ ...aud, only_replied: e.target.checked })} /> Só quem já respondeu alguma vez</label>
            <label className="check"><input type="checkbox" checked={!!aud.other_accounts} onChange={(e) => setAud({ ...aud, other_accounts: e.target.checked })} /> Incluir contatos de outras contas da agência (não recomendado: mistura clientes; um envio por telefone)</label>
            {(() => { const pn = phones.find((p) => p.id === form.phone_number_id); const lim = { TIER_250: 250, TIER_1K: 1000, TIER_2K: 2000, TIER_10K: 10000, TIER_100K: 100000 }[pn?.messaging_limit || ""]; return preview && lim && preview.total > lim ? <div className="notice warn">O público ({fmtInt(preview.total)}) passa do limite diário deste número ({LIMIT_LABEL[pn!.messaging_limit!]}). Os envios além do limite falham até o dia seguinte — divida o público em listas ou use outro número.</div> : null; })()}
            <div className="notice">
              {preview ? <><b>{fmtInt(preview.total)} contato(s)</b> receberão a mensagem (quem pediu opt-out já está fora).{preview.unit_cost ? <> Custo estimado: <b>{fmtMoney(preview.estimate || 0)}</b> ({fmtMoney(preview.unit_cost)} por mensagem, pela média dos últimos 60 dias).</> : " Ainda não há histórico de custo desta categoria para estimar."}{preview.sample.length ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Ex.: {preview.sample.slice(0, 5).map((s) => s.name || fmtPhone(s.phone)).join(", ")}</div> : null}</> : "Calculando o público…"}
            </div>
          </div>
        )}

        {step === 4 && tpl && (
          <div className="grid" style={{ gap: 12 }}>
            <div className="kv">
              <div><span>Disparo</span><b>{form.name}</b></div>
              <div><span>Número</span><b>{phones.find((p) => p.id === form.phone_number_id)?.display_phone_number}</b></div>
              <div><span>Template</span><b>{tpl.name} ({CATEGORY_LABEL[tpl.category || ""] || tpl.category})</b></div>
              <div><span>Público</span><b>{fmtInt(preview?.total || 0)} contatos</b></div>
              <div><span>Velocidade</span><b>{RATE_OPTIONS.find((r) => r.v === form.rate_per_minute)?.l}</b></div>
              <div><span>Custo estimado</span><b>{preview?.estimate != null ? fmtMoney(preview.estimate) : "—"}</b></div>
            </div>
            <div className="bubble preview"><div className="bubble-text">{previewFor(tpl.components, ph, fullMapping, sampleContact)}</div></div>
            <div className="seg" style={{ alignSelf: "start" }}>
              {([["now", "Enviar agora"], ["schedule", "Agendar"], ["draft", "Salvar rascunho"]] as const).map(([k, l]) => <a key={k} className={start === k ? "on" : ""} onClick={() => setStart(k)} style={{ cursor: "pointer" }}>{l}</a>)}
            </div>
            {start === "schedule" && <label className="field"><span>Data e hora de início (horário do seu computador)</span><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /><span className="muted" style={{ fontWeight: 400 }}>O envio começa em até 10 minutos depois do horário, mesmo com o painel fechado.</span></label>}
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>Os contatos ficam na fila e são enviados em lotes; você acompanha o progresso em tempo real e pode pausar a qualquer momento. Respostas aparecem no Atendimento com origem "Disparo".</p>
          </div>
        )}

        <div className="wizard-foot">
          <button className="btn" onClick={() => (step > 1 ? setStep(step - 1) : onClose())} disabled={busy}>{step > 1 ? "Voltar" : "Cancelar"}</button>
          <span style={{ flex: 1 }} />
          {step < 4 && <button className="btn primary" disabled={busy || (step === 1 && !step1ok) || (step === 2 && !step2ok) || (step === 3 && !step3ok)} onClick={() => setStep(step + 1)}>Continuar</button>}
          {step === 4 && <button className="btn primary" disabled={busy || (start === "schedule" && !when)} onClick={create}>{busy ? "Criando…" : start === "now" ? `Enviar para ${fmtInt(preview?.total || 0)} contatos` : start === "schedule" ? "Agendar disparo" : "Salvar rascunho"}</button>}
        </div>
      </div>
      {imp && <ImportModal catalog={catalog as any} onClose={() => setImp(false)} onDone={(m) => { setImp(false); setErr(""); setNote(m); api("/api/catalogo").then((c) => { setCatalog(c); setAud((a) => ({ ...a })); }); }} />}
    </div>
  );
}
