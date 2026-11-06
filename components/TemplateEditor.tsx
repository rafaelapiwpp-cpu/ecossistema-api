"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Waba = { id: string; name: string | null };
export type Btn = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url: string; urlExample: string; phone: string };
export const LANGS = [["pt_BR", "Português (BR)"], ["pt_PT", "Português (PT)"], ["en_US", "Inglês (EUA)"], ["es", "Espanhol"], ["es_AR", "Espanhol (AR)"], ["it", "Italiano"], ["fr", "Francês"]];

export async function api(url: string, body: any) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ? `${j.error}${j.details ? ` — ${j.details}` : ""}` : `Erro ${r.status}`);
  return j;
}

export const varsOf = (t: string) => { const out: string[] = []; for (const m of t.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1]); return out; };
export const fill = (t: string, ex: Record<string, string>) => t.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => ex[n]?.trim() || `{{${n}}}`);

export type TemplateFormState = {
  waba_id: string; name: string; language: string; category: string;
  headerKind: "none" | "text" | "image" | "video" | "document"; headerText: string; headerExample: string; headerHandle: string; headerFile: string;
  body: string; footer: string; allowChange: boolean;
};

/** Estado + validação + montagem dos componentes de um template. */
export function useTemplateForm(init: Partial<TemplateFormState> = {}, opts: { needName?: boolean } = {}) {
  const [f, setF] = useState<TemplateFormState>({ waba_id: "", name: "", language: "pt_BR", category: "MARKETING", headerKind: "none", headerText: "", headerExample: "", headerHandle: "", headerFile: "", body: "", footer: "", allowChange: true, ...init });
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [lastFile, setLastFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<TemplateFormState>) => setF((x) => ({ ...x, ...patch }));
  const text = (s: string) => s;
  const bodyVars = useMemo(() => varsOf(f.body), [f.body]);
  const headerVars = useMemo(() => varsOf(f.headerText), [f.headerText]);

  const problems: string[] = [];
  if (opts.needName !== false && f.name && !/^[a-z0-9_]+$/.test(f.name)) problems.push("Nome: só letras minúsculas, números e _");
  if (text(f.body).length > 1024) problems.push("Corpo com mais de 1024 caracteres");
  if (bodyVars.some((v, i) => Number(v) !== i + 1)) problems.push("As variáveis do corpo precisam ser {{1}}, {{2}}, {{3}}… nessa ordem");
  if (bodyVars.some((v) => !examples[v]?.trim())) problems.push("Dê um exemplo para cada variável (a Meta exige)");
  if (f.headerKind === "text" && (!text(f.headerText).trim() || text(f.headerText).length > 60)) problems.push("Cabeçalho de texto: até 60 caracteres");
  if (f.headerKind === "text" && headerVars.length > 1) problems.push("O cabeçalho aceita no máximo uma variável");
  if (f.headerKind === "text" && headerVars.length === 1 && !f.headerExample.trim()) problems.push("Dê um exemplo para a variável do cabeçalho");
  if (["image", "video", "document"].includes(f.headerKind) && !f.headerHandle) problems.push("Envie um arquivo de exemplo para o cabeçalho");
  if (text(f.footer).length > 60) problems.push("Rodapé: até 60 caracteres");
  if (buttons.length > 10) problems.push("No máximo 10 botões");
  for (const b of buttons) {
    if (!b.text.trim() || b.text.length > 25) problems.push(`Botão "${b.text || "(sem texto)"}": texto de 1 a 25 caracteres`);
    if (b.type === "URL" && !/^https?:\/\//.test(b.url)) problems.push(`Botão "${b.text}": link precisa começar com https://`);
    if (b.type === "URL" && b.url.includes("{{1}}") && !b.urlExample.trim()) problems.push(`Botão "${b.text}": dê um exemplo do link completo`);
    if (b.type === "PHONE_NUMBER" && !/^\+?\d{8,15}$/.test(b.phone.replace(/[\s()-]/g, ""))) problems.push(`Botão "${b.text}": telefone com DDI, ex.: +5585999990000`);
  }
  const ok = (opts.needName === false || !!f.name) && !!f.body.trim() && !problems.length;

  const components = () => {
    const comps: any[] = [];
    if (f.headerKind === "text") comps.push({ type: "HEADER", format: "TEXT", text: f.headerText.trim(), ...(headerVars.length ? { example: { header_text: [f.headerExample.trim()] } } : {}) });
    else if (f.headerKind !== "none") comps.push({ type: "HEADER", format: f.headerKind.toUpperCase(), example: { header_handle: [f.headerHandle] } });
    comps.push({ type: "BODY", text: f.body.trim(), ...(bodyVars.length ? { example: { body_text: [bodyVars.map((v) => examples[v].trim())] } } : {}) });
    if (f.footer.trim()) comps.push({ type: "FOOTER", text: f.footer.trim() });
    if (buttons.length) {
      const ordered = [...buttons.filter((b) => b.type === "QUICK_REPLY"), ...buttons.filter((b) => b.type !== "QUICK_REPLY")];
      comps.push({ type: "BUTTONS", buttons: ordered.map((b) => b.type === "QUICK_REPLY" ? { type: "QUICK_REPLY", text: b.text.trim() }
        : b.type === "URL" ? { type: "URL", text: b.text.trim(), url: b.url.trim(), ...(b.url.includes("{{1}}") ? { example: [b.urlExample.trim()] } : {}) }
        : { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: b.phone.replace(/[\s()-]/g, "") }) });
    }
    return comps;
  };

  const upload = async (file: File) => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData(); fd.set("file", file); fd.set("waba_id", f.waba_id || ""); // sobe com o token da BM desta conta
      const r = await fetch("/api/templates", { method: "POST", body: fd });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Falha no upload");
      set({ headerHandle: j.handle, headerFile: file.name });
      setLastFile(file);
      return j.handle as string;
    } catch (e: any) { setErr(e.message); return ""; } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const addBtn = (type: Btn["type"]) => setButtons((b) => [...b, { type, text: "", url: "https://", urlExample: "", phone: "+55" }]);
  const setBtn = (i: number, patch: Partial<Btn>) => setButtons((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return { f, set, examples, setExamples, buttons, setButtons, addBtn, setBtn, bodyVars, headerVars, problems, ok, components, upload, lastFile, busy, setBusy, err, setErr, fileRef };
}
export type TemplateForm = ReturnType<typeof useTemplateForm>;

/** Campos do template (sem conta/nome quando o chamador cuida disso). */
export function TemplateFields({ form, wabas, showAccount = true, showName = true, bodyRef }: { form: TemplateForm; wabas?: Waba[]; showAccount?: boolean; showName?: boolean; bodyRef?: React.RefObject<HTMLTextAreaElement | null> }) {
  const { f, set, examples, setExamples, buttons, setButtons, addBtn, setBtn, bodyVars, headerVars, upload, busy, fileRef } = form;
  return (
    <div className="grid" style={{ gap: 10 }}>
      {(showAccount || showName) && (
        <div className="kv-row">
          {showAccount && wabas && <label className="field"><span>Conta</span><select value={f.waba_id} onChange={(e) => set({ waba_id: e.target.value })}>{wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}</select></label>}
          {showName && <label className="field"><span>Nome (minúsculas, números e _)</span><input value={f.name} onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="promo_outubro" /></label>}
        </div>
      )}
      <div className="kv-row">
        <label className="field"><span>Categoria</span><select value={f.category} onChange={(e) => set({ category: e.target.value })}><option value="MARKETING">Marketing (promoções, ofertas)</option><option value="UTILITY">Utilidade (pedido, agendamento, aviso)</option></select></label>
        <label className="field"><span>Idioma</span><select value={f.language} onChange={(e) => set({ language: e.target.value })}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      <label className="field"><span>Cabeçalho</span>
        <select value={f.headerKind} onChange={(e) => set({ headerKind: e.target.value as TemplateFormState["headerKind"], headerHandle: "", headerFile: "" })}><option value="none">Sem cabeçalho</option><option value="text">Texto</option><option value="image">Imagem</option><option value="video">Vídeo</option><option value="document">Documento (PDF)</option></select>
      </label>
      {f.headerKind === "text" && <div className="kv-row"><label className="field"><span>Texto do cabeçalho (até 60)</span><input value={f.headerText} onChange={(e) => set({ headerText: e.target.value })} placeholder="Oferta para {{1}}" /></label>{headerVars.length > 0 && <label className="field"><span>Exemplo para {`{{${headerVars[0]}}}`}</span><input value={f.headerExample} onChange={(e) => set({ headerExample: e.target.value })} placeholder="Maria" /></label>}</div>}
      {["image", "video", "document"].includes(f.headerKind) && <div className="field"><span>Arquivo de exemplo (a Meta usa só na análise; no disparo você escolhe o arquivo real)</span><div className="src-row"><input ref={fileRef} type="file" accept={f.headerKind === "image" ? "image/jpeg,image/png" : f.headerKind === "video" ? "video/mp4" : "application/pdf"} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={busy} /><span className="muted">{f.headerHandle ? `✓ ${f.headerFile}` : "nenhum arquivo"}</span></div></div>}
      <label className="field"><span>Corpo da mensagem (use {"{{1}}"}, {"{{2}}"}… para variáveis) · {f.body.length}/1024</span><textarea ref={bodyRef} rows={6} value={f.body} onChange={(e) => set({ body: e.target.value })} placeholder={"Olá {{1}}! Temos uma condição especial para você este mês: {{2}}. Quer saber mais?"} style={{ fontFamily: "inherit", fontSize: 14 }} /></label>
      {bodyVars.length > 0 && <div className="field"><span>Exemplos (a Meta exige um valor de exemplo por variável)</span><div className="grid" style={{ gap: 6, gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>{bodyVars.map((v) => <input key={v} placeholder={`Exemplo de {{${v}}}`} value={examples[v] || ""} onChange={(e) => setExamples({ ...examples, [v]: e.target.value })} />)}</div></div>}
      <label className="field"><span>Rodapé (opcional, até 60) — ex.: "Responda SAIR para não receber mais"</span><input value={f.footer} onChange={(e) => set({ footer: e.target.value })} /></label>
      <div className="field"><span>Botões (até 10)</span>
        <div className="grid" style={{ gap: 6 }}>
          {buttons.map((b, i) => (
            <div key={i} className="btn-row">
              <select value={b.type} onChange={(e) => setBtn(i, { type: e.target.value as Btn["type"] })}><option value="QUICK_REPLY">Resposta rápida</option><option value="URL">Abrir link</option><option value="PHONE_NUMBER">Ligar</option></select>
              <input placeholder="Texto do botão (até 25)" value={b.text} onChange={(e) => setBtn(i, { text: e.target.value })} />
              {b.type === "URL" && <input placeholder="https://seusite.com/{{1}}" value={b.url} onChange={(e) => setBtn(i, { url: e.target.value })} />}
              {b.type === "URL" && b.url.includes("{{1}}") && <input placeholder="Exemplo do link completo" value={b.urlExample} onChange={(e) => setBtn(i, { urlExample: e.target.value })} />}
              {b.type === "PHONE_NUMBER" && <input placeholder="+5585999990000" value={b.phone} onChange={(e) => setBtn(i, { phone: e.target.value })} />}
              <button className="btn icon" onClick={() => setButtons(buttons.filter((_, j) => j !== i))} title="Remover">×</button>
            </div>
          ))}
        </div>
        <div className="chips"><button className="chip pick" onClick={() => addBtn("QUICK_REPLY")}>+ resposta rápida</button><button className="chip pick" onClick={() => addBtn("URL")}>+ link</button><button className="chip pick" onClick={() => addBtn("PHONE_NUMBER")}>+ ligar</button></div>
      </div>
      <label className="check"><input type="checkbox" checked={f.allowChange} onChange={(e) => set({ allowChange: e.target.checked })} /> Permitir que a Meta mude a categoria se achar que ela não bate com o conteúdo (evita rejeição)</label>
    </div>
  );
}

/** Prévia no estilo WhatsApp. `texts` permite mostrar outro texto no lugar do formulário. */
export function TemplatePreview({ form, texts, label = "Prévia (com os exemplos)" }: { form: TemplateForm; texts?: { header?: string; body: string; footer?: string }; label?: string }) {
  const { f, examples, buttons } = form;
  const header = texts?.header ?? f.headerText, body = texts?.body ?? f.body, footer = texts?.footer ?? f.footer;
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>{label}</div>
      <div className="wa-preview">
        {f.headerKind === "text" && header && <div className="wa-head">{fill(header, { 1: f.headerExample })}</div>}
        {["image", "video", "document"].includes(f.headerKind) && <div className="wa-media">{f.headerKind === "image" ? "🖼️ imagem" : f.headerKind === "video" ? "🎬 vídeo" : "📄 documento"}</div>}
        <div className="wa-body">{fill(body, examples) || <span className="muted">O corpo da mensagem aparece aqui…</span>}</div>
        {footer && <div className="wa-foot">{footer}</div>}
        {buttons.map((b, i) => <div key={i} className="wa-btn">{b.type === "URL" ? "🔗 " : b.type === "PHONE_NUMBER" ? "📞 " : "↩︎ "}{b.text || "…"}</div>)}
      </div>
    </div>
  );
}

/** Botão "Novo template" + editor com prévia. */
export function NewTemplateButton({ wabas, canEdit }: { wabas: Waba[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;
  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)}>Novo template</button>
      {open && <TemplateEditor wabas={wabas} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Excluir um template (todas as línguas com esse nome). */
export function DeleteTemplateButton({ wabaId, name, canEdit }: { wabaId: string; name: string; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!canEdit) return null;
  const go = async () => {
    if (!confirm(`Excluir o template "${name}" na Meta? Isso não pode ser desfeito.`)) return;
    setBusy(true); setErr("");
    try { await api("/api/templates", { action: "delete", waba_id: wabaId, name }); router.refresh(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return <><button className="btn" onClick={go} disabled={busy} style={{ padding: "4px 8px", fontSize: 12 }}>Excluir</button>{err && <div className="err">{err}</div>}</>;
}

function TemplateEditor({ wabas, onClose }: { wabas: Waba[]; onClose: () => void }) {
  const router = useRouter();
  const form = useTemplateForm({ waba_id: wabas[0]?.id || "" });
  const { f, ok, components, busy, setBusy, err, setErr, problems } = form;
  const [done, setDone] = useState("");

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const j = await api("/api/templates", { action: "create", waba_id: f.waba_id, name: f.name, language: f.language, category: f.category, components: components(), allow_category_change: f.allowChange });
      setDone(`Template "${f.name}" enviado para análise da Meta (status: ${j.status === "APPROVED" ? "aprovado" : j.status === "PENDING" ? "em análise" : j.status}). O status é atualizado pelo webhook ou na próxima sincronização.`);
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wizard" onClick={(e) => e.stopPropagation()} style={{ width: "min(960px, 100%)" }}>
        <div className="panel-head"><h2 style={{ margin: 0 }}>Novo template</h2><button className="btn icon" onClick={onClose}>×</button></div>
        {err && <div className="banner err">{err}</div>}
        {done ? (
          <>
            <div className="banner">{done}</div>
            <div className="wizard-foot"><span style={{ flex: 1 }} /><button className="btn primary" onClick={onClose}>Fechar</button></div>
          </>
        ) : (
          <div className="tpl-editor">
            <TemplateFields form={form} wabas={wabas} />
            <div>
              <TemplatePreview form={form} />
              {problems.length > 0 && <ul className="steps" style={{ marginTop: 10, color: "var(--serious)", fontSize: 12 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
              <p className="muted" style={{ fontSize: 12 }}>Dicas da Meta: nada de texto só com variáveis, sem variáveis coladas uma na outra, sem abreviações estranhas e sem promessas enganosas. Marketing costuma ser aprovado em minutos; se for rejeitado, o motivo aparece na lista.</p>
            </div>
          </div>
        )}
        {!done && <div className="wizard-foot"><button className="btn" onClick={onClose} disabled={busy}>Cancelar</button><span style={{ flex: 1 }} /><button className="btn primary" disabled={!ok || busy} onClick={submit}>{busy ? "Enviando…" : "Enviar para análise"}</button></div>}
      </div>
    </div>
  );
}

/** Liga as métricas da Meta (insights) nas contas que ainda não têm e baixa os últimos 90 dias. */
export function InsightsButton({ pending, isAdmin }: { pending: number; isAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const go = async (action: "enable_insights" | "refresh_metrics") => {
    if (action === "enable_insights" && !confirm("Ativar as métricas de templates nas contas? A Meta passa a registrar envios, entregas, leituras e cliques por template (ela não permite desligar depois).")) return;
    setBusy(true); setMsg("");
    try {
      const j = await api("/api/templates", { action });
      const fails = (j.log || []).filter((l: any) => !l.ok);
      setMsg(fails.length ? `Com erro em ${fails.length} conta(s): ${fails[0].info}` : "Métricas atualizadas");
      router.refresh();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {pending > 0 && isAdmin && <button className="btn tint" onClick={() => go("enable_insights")} disabled={busy}>{busy ? "Ativando…" : `Ativar métricas da Meta (${pending} conta${pending > 1 ? "s" : ""})`}</button>}
      <button className="btn" onClick={() => go("refresh_metrics")} disabled={busy} title="Baixa de novo os últimos 90 dias de métricas da Meta">{busy ? "Atualizando…" : "Atualizar métricas"}</button>
      {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
    </span>
  );
}
