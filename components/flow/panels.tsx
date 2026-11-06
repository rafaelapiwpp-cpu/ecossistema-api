"use client";
// Painéis de propriedades dos blocos (abrem à esquerda do canvas, no formato "← Título / descrição / campos").
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fieldOfToken, fillTokens, placeholdersOf, previewFor, resolveSource, tokenOfField, type Mapping, type ParamSource } from "@/lib/template-vars";
import { adaptMapping, equalSplit, groupOf, pctSum, phoneSplitOf, splitBranchesOf, triggersOf, type FlowNode, type GroupEntry, type NodeType, type PhoneSplit, type SplitBranch } from "@/lib/flow-shared";
import { CATEGORY_LABEL, QUALITY_LABEL, LIMIT_LABEL, fmtInt } from "@/lib/format";
import { ACTION_LABEL, BLOCK, BRANCH_COLORS, MESSAGE_KINDS, TIMEOUTS, templateButtons, templateCategories, type Ctx } from "./shared";
import { PhonePreview, templatePreview, type PreviewMsg } from "./PhonePreview";
import { FIcon } from "./icons";
import { TriggerForm, TriggerList } from "./triggers";

export type Audience = { total: number; sample: { phone: string; name: string | null }[] } | null;
export type PanelProps = {
  node: FlowNode; ctx: Ctx; flow: { id: number; waba_id: string; phone_number_id: string; status?: string }; update: (patch: any) => void;
  incoming: FlowNode[]; start: FlowNode | null; audience: Audience;
  /** Início: gatilho aberto no painel (null = visão geral) */
  sub?: { key: string; n: number } | null; onSub?: (key: string | null) => void;
};

export const CAT_TONE: Record<string, string> = { MARKETING: "warning", MARKETING_LITE: "warning", UTILITY: "good", AUTHENTICATION: "neutral", SERVICE: "neutral" };
export function CatPill({ category }: { category: string | null | undefined }) {
  const k = String(category || "UNKNOWN");
  return <span className={`cat-pill cat-${k.toLowerCase()}`}>{CATEGORY_LABEL[k] || k}</span>;
}

/** Estimativa de envios por template e por número, se todos os contatos do público passarem pelo bloco. */
export function estimateGroup(total: number, split: PhoneSplit[], group: GroupEntry[]) {
  const per = new Map<string, number>(), perPhone = new Map<string, number>();
  const sumSplit = pctSum(split) || 1;
  for (const p of split) {
    const leads = (total * p.pct) / sumSplit;
    let cand = group.filter((e) => !e.phone_number_id || e.phone_number_id === p.id);
    if (!cand.length) cand = group;
    const sumC = pctSum(cand) || 1;
    perPhone.set(p.id, leads);
    for (const e of cand) per.set(e.template_id, (per.get(e.template_id) || 0) + (leads * e.pct) / sumC);
  }
  return { per, perPhone };
}

/** Arquivos enviados nesta sessão (id da mídia → endereço local), para a prévia aparecer na hora. */
export const localMedia = new Map<string, string>();
export const mediaSrc = (id?: string | null) => (!id ? null : localMedia.get(id) || (/^\d+$/.test(id) ? `/api/media/${id}` : null));

export const SAMPLE = { name: "Maria Souza", phone: "5585999990000", email: "maria@exemplo.com", fields: {} as Record<string, any> };
export type SampleContact = typeof SAMPLE;

// ---------- casca do painel ----------

export function PanelShell({ icon, color, title, desc, onBack, children, foot }: { icon?: string; color?: string; title: string; desc?: ReactNode; onBack: () => void; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="fp">
      <div className="fp-head">
        <button type="button" className="fp-back" onClick={onBack} aria-label="Fechar painel" title="Fechar (Esc)"><FIcon name="arrowLeft" size={19} stroke={2} /></button>
        {icon && <span className="fp-ico" style={{ color }}><FIcon name={icon} size={18} stroke={2} /></span>}
        <h2>{title}</h2>
      </div>
      {desc ? <p className="fp-desc">{desc}</p> : null}
      <div className="fp-body">{children}</div>
      {foot ? <div className="fp-foot">{foot}</div> : null}
    </div>
  );
}

const HELP: Record<NodeType, string> = {
  start: "O que inicia a automação: gatilhos (sozinha, quando o contato escreve) ou o botão Iniciar, para um público.",
  template: "Escolha o template e preencha as variáveis — o celular mostra como o lead recebe.",
  message: "Mensagem livre: só é entregue com a janela de 24 h aberta (depois que o contato respondeu).",
  wait: "O fluxo para e espera a resposta. Cada opção vira uma saída do bloco.",
  condition: "Segue por um caminho ou outro conforme os dados do lead.",
  action: "Executa ações no contato e na conversa antes de seguir.",
  delay: "Espera uma quantidade informada de tempo para continuar a execução.",
  split: "Modifique as ramificações e seus percentuais. Cada contato cai em uma delas, mantendo as porcentagens.",
  handoff: "Entrega a conversa para a equipe: ela aparece como Nova no Atendimento.",
  end: "Quando um contato chega aqui, a execução dele termina como \"Concluído\".",
};

export function Panel(props: PanelProps & { onClose: () => void; onDelete?: () => void }) {
  const t = props.node.type;
  const meta = BLOCK[t];
  const [renaming, setRenaming] = useState(false);
  const title = String(props.node.data?.title || "").trim() || meta.label;
  // gatilho aberto: o painel vira "← Mensagem recebida" (voltar = lista do Início)
  const trig = t === "start" && !!props.sub && triggersOf(props.node.data).some((x) => x.id === props.sub!.key);
  return (
    <PanelShell
      icon={trig ? "bubble" : meta.icon} color={trig ? "#007aff" : meta.color} title={trig ? "Mensagem recebida" : title} desc={trig ? "Quando uma mensagem é recebida" : HELP[t]}
      onBack={trig ? () => props.onSub?.(null) : props.onClose}
      foot={t !== "start" ? (
        <>
          {t !== "end" && (renaming
            ? <input className="fp-rename" autoFocus value={props.node.data?.title || ""} placeholder={meta.label} onChange={(e) => props.update({ title: e.target.value })} onBlur={() => setRenaming(false)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setRenaming(false); }} />
            : <button type="button" className="fp-link" onClick={() => setRenaming(true)}><FIcon name="pencil" size={15} />Dar um nome ao bloco</button>)}
          <span style={{ flex: 1 }} />
          {props.onDelete && <button type="button" className="fp-link danger" onClick={props.onDelete}><FIcon name="trash" size={15} />Excluir</button>}
        </>
      ) : undefined}
    >
      {t === "start" && (trig ? <TriggerForm {...props} /> : <StartPanel {...props} />)}
      {t === "template" && <TemplatePanel {...props} />}
      {t === "message" && <MessagePanel {...props} />}
      {t === "wait" && <WaitPanel {...props} />}
      {t === "condition" && <ConditionPanel {...props} />}
      {t === "action" && <ActionPanel {...props} />}
      {t === "delay" && <DelayPanel {...props} />}
      {t === "split" && <SplitPanel {...props} />}
      {t === "handoff" && <HandoffPanel {...props} />}
      {t === "end" && <p className="fp-note">Ligue aqui os caminhos que devem encerrar. Saídas sem ligação também encerram a execução.</p>}
    </PanelShell>
  );
}

// ---------- Início ----------

/** Quantos contatos desta conta (que aceitam mensagens) há em cada lista, tag e departamento. */
type AccountCounts = { total: number; lists: Record<string, number>; tags: Record<string, number>; departments: Record<string, number> };
function useAccountCounts(waba: string) {
  const [c, setC] = useState<AccountCounts | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/contatos/resumo?waba=${encodeURIComponent(waba)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive && j && !j.error) setC(j); }).catch(() => {});
    return () => { alive = false; };
  }, [waba]);
  return c;
}

function StartPanel({ node, ctx, flow, update, audience, onSub }: PanelProps) {
  const d = node.data || {};
  const a = d.audience || {};
  const setA = (patch: any) => update({ audience: { ...a, ...patch } });
  const toggle = (arr: number[] = [], id: number) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const c = ctx.catalog;
  const counts = useAccountCounts(flow.waba_id);
  const account = c.wabas.find((w) => w.id === flow.waba_id)?.name;
  const others = !!a.other_accounts;
  // só as listas desta conta (ou sem conta); as já escolhidas continuam aparecendo
  const lists = c.lists.filter((l) => others || !l.waba_id || l.waba_id === flow.waba_id || (a.list_ids || []).includes(l.id));
  const n = (map: Record<string, number> | undefined, id: number) => (counts && !others ? map?.[id] ?? 0 : null);
  const chip = (label: string, k: number | null, on: boolean, onClick: () => void, key: number) => (
    <button key={key} type="button" className={`chip pick ${on ? "on" : ""}${k === 0 && !on ? " empty" : ""}`} onClick={onClick} title={k === 0 ? "Nenhum contato desta conta aqui" : undefined}>{label}{k != null ? ` (${fmtInt(k)})` : ""}</button>
  );
  const trig = triggersOf(node.data);
  const manualSet = a.scope === "all" || !!((a.list_ids || []).length || (a.tag_ids || []).length || String(a.phones_text || "").trim());
  return (
    <>
      <TriggerList node={node} ctx={ctx} flow={flow} update={update} incoming={[]} start={null} audience={audience} onSub={onSub} />
      <details className="fp-manual" open={!trig.length || manualSet || undefined}>
      <summary>Disparo manual <small>botão Iniciar, para um público</small></summary>
      <div className="fp-field"><label>Quem entra no fluxo</label>
        <div className="seg seg-full">
          {([["lists", "Listas"], ["tags", "Tags"], ["all", "Todos"], ["phones", "Números"]] as const).map(([k, l]) => <a key={k} className={a.scope === k ? "on" : ""} onClick={() => setA({ scope: k })}>{l}</a>)}
        </div>
        {a.scope !== "phones" && <p className="fp-note">{others ? "Atenção: incluindo contatos de outras contas da agência." : <>Só contatos {account ? <>da conta <b>{account}</b></> : "desta conta"}{counts ? <> ({fmtInt(counts.total)} que aceitam mensagens)</> : null} — nada de outros clientes.</>}</p>}
      </div>
      {a.scope === "lists" && <div className="fp-field"><label>Listas (qualquer uma)</label><div className="chips">{lists.map((l) => chip(l.name, n(counts?.lists, l.id) ?? (l.total ?? null), (a.list_ids || []).includes(l.id), () => setA({ list_ids: toggle(a.list_ids, l.id) }), l.id))}{!lists.length && <span className="fp-note">Nenhuma lista desta conta ainda — crie em Leads (Nova lista) ou em Contatos (Gerenciar selecionados → Adicionar à lista).</span>}</div></div>}
      {a.scope === "tags" && <div className="fp-field"><label>Tags (qualquer uma)</label><div className="chips">{c.tags.map((t) => chip(t.name, n(counts?.tags, t.id), (a.tag_ids || []).includes(t.id), () => setA({ tag_ids: toggle(a.tag_ids, t.id) }), t.id))}{!c.tags.length && <span className="fp-note">Nenhuma tag ainda — crie em Contatos ou em Leads.</span>}</div></div>}
      {a.scope === "phones" && <div className="fp-field"><label>Números (um por linha; DDD + número)</label><textarea rows={5} value={a.phones_text || ""} onChange={(e) => setA({ phones_text: e.target.value })} placeholder={"85 99999-0001\n85 99999-0002"} /></div>}
      <div className="fp-audience">
        <span className="fp-audience-n num">{audience ? fmtInt(audience.total) : "…"}</span>
        <span>{audience ? <>contato(s) entram quando você iniciar<small>{audience.sample.length ? `Ex.: ${audience.sample.slice(0, 3).map((s) => s.name || s.phone).join(", ")}` : "quem pediu opt-out já está fora"}</small></> : "Calculando o público…"}</span>
      </div>
      <div className="fp-field"><label>Velocidade de entrada</label><select value={d.rate_per_minute || 60} onChange={(e) => update({ rate_per_minute: Number(e.target.value) })}>{[30, 60, 120, 300, 600].map((v) => <option key={v} value={v}>{v} contatos por minuto</option>)}</select></div>
      <PhonesSplit d={d} ctx={ctx} flow={flow} update={update} total={audience?.total ?? null} />
      <details className="fp-more" open={!!(a.department_id || a.exclude_recent_days || (a.exclude_tag_ids || []).length || a.only_replied || others) || undefined}>
        <summary>Filtros do público</summary>
        <div className="fp-field"><label>Só do departamento</label><select value={a.department_id || ""} onChange={(e) => setA({ department_id: e.target.value })}><option value="">Qualquer</option>{c.departments.map((x) => { const k = n(counts?.departments, x.id); return <option key={x.id} value={x.id}>{x.name}{k != null ? ` (${fmtInt(k)})` : ""}</option>; })}</select></div>
        <div className="fp-field"><label>Não incluir quem recebeu mensagem nos últimos</label><select value={a.exclude_recent_days || 0} onChange={(e) => setA({ exclude_recent_days: Number(e.target.value) })}><option value={0}>Sem restrição</option><option value={1}>1 dia</option><option value={3}>3 dias</option><option value={7}>7 dias</option><option value={15}>15 dias</option><option value={30}>30 dias</option></select></div>
        {c.tags.length > 0 && <div className="fp-field"><label>Excluir quem tem a tag</label><div className="chips">{c.tags.map((t) => <button key={t.id} type="button" className={`chip pick ${(a.exclude_tag_ids || []).includes(t.id) ? "on" : ""}`} onClick={() => setA({ exclude_tag_ids: toggle(a.exclude_tag_ids, t.id) })}>{t.name}</button>)}</div></div>}
        <label className="check"><input type="checkbox" checked={!!a.only_replied} onChange={(e) => setA({ only_replied: e.target.checked })} /> Só quem já respondeu alguma vez</label>
        <label className="check"><input type="checkbox" checked={others} onChange={(e) => setA({ other_accounts: e.target.checked })} /> Incluir contatos de outras contas da agência (não recomendado: mistura clientes)</label>
      </details>
      </details>
    </>
  );
}

/** Randomizador de números: divide o público entre os números da conta, com % por número. */
function PhonesSplit({ d, ctx, flow, update, total }: { d: any; ctx: Ctx; flow: PanelProps["flow"]; update: (p: any) => void; total: number | null }) {
  const phones = ctx.catalog.phones.filter((p) => p.waba_id === flow.waba_id);
  const split = phoneSplitOf(d, flow.phone_number_id);
  const on = new Set(split.map((p) => p.id));
  const setPhones = (list: PhoneSplit[]) => update({ phones: list });
  const toggle = (id: string) => {
    const next = on.has(id) ? split.filter((p) => p.id !== id) : [...split, { id, pct: 0 }];
    if (!next.length) return;
    const eq = equalSplit(next.length);
    setPhones(next.map((p, i) => ({ ...p, pct: eq[i] })));
  };
  const equalize = () => { const eq = equalSplit(split.length); setPhones(split.map((p, i) => ({ ...p, pct: eq[i] }))); };
  const setPct = (id: string, pct: number) => setPhones(split.map((p) => (p.id === id ? { ...p, pct: Math.max(0, Math.min(100, Math.round(pct))) } : p)));
  const sum = pctSum(split);
  const ok = Math.round(sum) === 100;
  return (
    <div className="fp-group">
      <div className="fp-group-head"><b>Números de envio</b>{split.length > 1 && <button type="button" className="fp-link" onClick={equalize}>Dividir igualmente</button>}</div>
      {phones.map((p) => {
        const sel = split.find((x) => x.id === p.id);
        const est = sel && total != null ? Math.round((total * sel.pct) / 100) : null;
        return (
          <div key={p.id} className={`fp-row ${sel ? "on" : ""}`}>
            <label className="check small" title={sel ? "Tirar este número do disparo" : "Usar este número no disparo"}><input type="checkbox" checked={!!sel} onChange={() => toggle(p.id)} /></label>
            <span className="fp-row-main"><b className="num">{p.display_phone_number}{p.label ? ` · ${p.label}` : ""}</b><small>{p.verified_name || ""}{p.quality_rating ? ` · qualidade ${QUALITY_LABEL[p.quality_rating] || p.quality_rating}` : ""}{p.messaging_limit ? ` · ${LIMIT_LABEL[p.messaging_limit] || p.messaging_limit}` : ""}</small></span>
            {sel && split.length > 1 ? <span className="pct-input"><input type="number" min={0} max={100} value={sel.pct} onChange={(e) => setPct(p.id, Number(e.target.value))} aria-label="porcentagem" /><em>%</em></span> : null}
            {sel && est != null && split.length > 1 ? <span className="fp-row-est num">≈ {fmtInt(est)}</span> : null}
          </div>
        );
      })}
      {phones.length <= 1 && <p className="fp-note">Esta conta tem só um número. Quando houver mais (Contas e números → Sincronizar), eles aparecem aqui para dividir o disparo.</p>}
      {split.length > 1 && <p className={ok ? "ok" : "err"} style={{ margin: 0, fontSize: 12 }}>{ok ? "Soma 100 % · cada contato fica no número sorteado até o fim do fluxo." : `As porcentagens somam ${sum} % — precisam somar 100 %.`}</p>}
    </div>
  );
}

// ---------- Template ----------

/** Um parâmetro do template: amostra, texto com dados do contato ({ }) e, se for só um dado, o valor reserva. */
function ParamField({ label, sample, src, fields, onChange }: { label: ReactNode; sample?: string | null; src: ParamSource; fields: { value: string; label: string }[]; onChange: (s: ParamSource) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState(false);
  const text = src.kind === "field" ? `{{${tokenOfField(src.value)}}}` : src.value || "";
  const set = (v: string) => {
    const m = v.match(/^\s*\{\{\s*([\w.]+)\s*\}\}\s*$/);
    const f = m ? fieldOfToken(m[1]) : null;
    if (f) onChange({ key: src.key, kind: "field", value: f, fallback: src.fallback || "" });
    else onChange({ key: src.key, kind: "text", value: v, fallback: "" });
  };
  const insert = (token: string) => {
    const el = ref.current;
    const a = el?.selectionStart ?? text.length, b = el?.selectionEnd ?? text.length;
    set(text.slice(0, a) + `{{${token}}}` + text.slice(b));
    setMenu(false);
    requestAnimationFrame(() => { if (!el) return; el.focus(); const pos = a + token.length + 4; el.setSelectionRange(pos, pos); });
  };
  const fieldLabel = fields.find((f) => f.value === src.value)?.label?.toLowerCase() || "esse dado";
  const rows = Math.min(6, Math.max(2, text.split("\n").length + (text.length > 70 ? 1 : 0)));
  return (
    <div className="pf">
      <div className="pf-label">{label}</div>
      {sample ? <div className="pf-sample"><span>Amostra: {sample}</span><button type="button" onClick={() => set(sample)} title="Usar a amostra" aria-label="Usar a amostra"><FIcon name="copy" size={14} /></button></div> : null}
      <div className="pf-box">
        <textarea ref={ref} rows={rows} value={text} onChange={(e) => set(e.target.value)} placeholder="Texto que vai no lugar da variável" />
        <button type="button" className="pf-var" onClick={() => setMenu(!menu)} title="Inserir dado do contato" aria-label="Inserir dado do contato">{"{ }"}</button>
        {menu && (
          <div className="pf-menu" onMouseLeave={() => setMenu(false)}>
            {fields.map((f) => <button key={f.value} type="button" onClick={() => insert(tokenOfField(f.value))}><span>{f.label}</span><code>{`{{${tokenOfField(f.value)}}}`}</code></button>)}
          </div>
        )}
      </div>
      {src.kind === "field" && (
        <label className="pf-fb"><span>Se o contato não tiver {fieldLabel}, usar</span><input value={src.fallback || ""} onChange={(e) => onChange({ ...src, fallback: e.target.value })} placeholder="ex.: cliente" /></label>
      )}
    </div>
  );
}

/** Exemplos que a Meta guarda no template ({{1}} → "nº 12345"). */
function examplesOf(components: any[] | null | undefined) {
  const comps = components || [];
  const body = comps.find((c: any) => c?.type === "BODY");
  const header = comps.find((c: any) => c?.type === "HEADER");
  const bodyEx: string[] = body?.example?.body_text?.[0] || [];
  const named: Record<string, string> = Object.fromEntries(((body?.example?.body_text_named_params || []) as any[]).map((x) => [x.param_name, x.example]));
  return { body: (key: string, i: number) => named[key] || bodyEx[/^\d+$/.test(key) ? Number(key) - 1 : i] || null, header: (header?.example?.header_text?.[0] as string) || null };
}

/** Texto do template com as variáveis destacadas e os botões, como referência para preencher. */
function TemplateText({ components }: { components: any[] | null | undefined }) {
  const comps = components || [];
  const body = String(comps.find((c: any) => c?.type === "BODY")?.text || "");
  const btns = ((comps.find((c: any) => c?.type === "BUTTONS")?.buttons || []) as any[]);
  const parts = body.split(/(\{\{\s*[\w.]+\s*\}\})/g);
  return (
    <div className="tpl-text">
      <p>{parts.map((p, i) => (/^\{\{/.test(p) ? <mark key={i}>{p.replace(/\s+/g, "")}</mark> : <span key={i}>{p}</span>))}</p>
      {btns.length > 0 && <div className="tpl-btns">{btns.map((b, i) => <span key={i}>{b.type === "URL" ? "↗ " : b.type === "PHONE_NUMBER" ? "✆ " : ""}{b.text || b.type}</span>)}</div>}
    </div>
  );
}

function MappingFields({ ph, m, ctx, flow, comps, setMapping }: { ph: ReturnType<typeof placeholdersOf>; m: Mapping; ctx: Ctx; flow: PanelProps["flow"]; comps: any[] | null | undefined; setMapping: (p: Partial<Mapping>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ex = examplesOf(comps);
  const upload = async (file: File) => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData(); fd.set("file", file); fd.set("phone_number_id", flow.phone_number_id);
      const r = await fetch("/api/media/upload", { method: "POST", body: fd }); const up = await r.json();
      if (!r.ok) throw new Error(up.error || "Falha no upload");
      if (up.id) localMedia.set(String(up.id), URL.createObjectURL(file));
      setMapping({ header: { kind: ph.header.kind as any, media_id: up.id, filename: up.filename || file.name } });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const media = ph.header.kind === "image" || ph.header.kind === "video" || ph.header.kind === "document";
  const h = m.header as any;
  return (
    <>
      {err && <p className="err">{err}</p>}
      {media && (
        <div className="fp-field"><label>Arquivo do cabeçalho ({ph.header.kind === "image" ? "imagem" : ph.header.kind === "video" ? "vídeo" : "documento"})</label>
          <div className="fp-file">
            <span className="fp-file-ico">{h?.media_id && ph.header.kind === "image" && mediaSrc(h.media_id) ? <img src={mediaSrc(h.media_id)!} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <FIcon name={ph.header.kind === "image" ? "image" : ph.header.kind === "video" ? "video" : "doc"} size={18} />}</span>
            <span className="fp-file-name">{h?.media_id ? (h.filename || "arquivo enviado") : "Nenhum arquivo"}</span>
            <button type="button" className="btn small tint" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Enviando…" : h?.media_id ? "Trocar" : "Escolher"}</button>
            <input ref={fileRef} type="file" hidden accept={ph.header.kind === "image" ? "image/jpeg,image/png" : ph.header.kind === "video" ? "video/mp4" : "application/pdf,.pdf"} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
        </div>
      )}
      {ph.header.kind === "text" && ph.header.keys.length > 0 && (
        <ParamField label={<>Parâmetro <code>{`{{${ph.header.keys[0]}}}`}</code> do cabeçalho</>} sample={ex.header} fields={ctx.options.fields}
          src={m.header?.kind === "text" ? { ...m.header.source, key: ph.header.keys[0] } : { key: ph.header.keys[0], kind: "text", value: "", fallback: "" }}
          onChange={(s) => setMapping({ header: { kind: "text", source: s } })} />
      )}
      {ph.body.map((k, i) => {
        const src = m.body.find((b) => b.key === k) || { key: k, kind: "text" as const, value: "", fallback: "" };
        return <ParamField key={k} label={<>Parâmetro <code>{`{{${k}}}`}</code> do corpo</>} sample={ex.body(k, i)} fields={ctx.options.fields} src={src}
          onChange={(s) => setMapping({ body: ph.body.map((kk) => (kk === k ? s : (m.body.find((b) => b.key === kk) || { key: kk, kind: "text", value: "", fallback: "" }))) })} />;
      })}
      {ph.buttons.map((b) => {
        const cur = (m.buttons || []).find((x) => x.index === b.index) || { index: b.index, sub_type: b.sub_type, source: { key: `btn${b.index}`, kind: "text" as const, value: "", fallback: "" } };
        return <ParamField key={b.index} label={<>Botão “{b.text}” — {b.sub_type === "url" ? "final do link" : "código do cupom"}</>} fields={ctx.options.fields} src={cur.source}
          onChange={(s) => setMapping({ buttons: ph.buttons.map((bb) => (bb.index === b.index ? { ...cur, source: s } : ((m.buttons || []).find((x) => x.index === bb.index) || { index: bb.index, sub_type: bb.sub_type, source: { key: `btn${bb.index}`, kind: "text", value: "", fallback: "" } }))) })} />;
      })}
      {!media && ph.header.kind !== "text" && !ph.body.length && !ph.buttons.length && <p className="fp-note">Este template não tem variáveis: ele vai exatamente como foi aprovado.</p>}
    </>
  );
}

const guessMapping = (components: any[] | null | undefined): Mapping => {
  const p = placeholdersOf(components);
  const guess = (key: string): ParamSource => ({ key, kind: "field", value: "first_name", fallback: "cliente" });
  return {
    header: p.header.kind === "text" && p.header.keys.length ? { kind: "text", source: guess(p.header.keys[0]) } : null,
    body: p.body.map((k) => ({ key: k, kind: "text", value: "", fallback: "" })),
    buttons: p.buttons.map((b) => ({ index: b.index, sub_type: b.sub_type, source: { key: `btn${b.index}`, kind: "text", value: "", fallback: "" } })),
  };
};

function TemplatePanel(props: PanelProps) {
  const { node, update } = props;
  const d = node.data || {};
  const mode = d.mode === "group" ? "group" : "single";
  const setMode = (m: "single" | "group") => {
    if (m === mode) return;
    if (m === "group" && !groupOf(d).length && d.template_id) update({ mode: m, group: [{ template_id: String(d.template_id), pct: 100, phone_number_id: null }] });
    else update({ mode: m });
  };
  return (
    <>
      <div className="seg seg-full">
        <a className={mode === "single" ? "on" : ""} onClick={() => setMode("single")}>Um template</a>
        <a className={mode === "group" ? "on" : ""} onClick={() => setMode("group")}>Vários · randomizador</a>
      </div>
      {mode === "group" ? <GroupPanel {...props} /> : <SinglePanel {...props} />}
    </>
  );
}

function SinglePanel({ node, ctx, flow, update }: PanelProps) {
  const d = node.data || {};
  const templates = ctx.templates.filter((t) => t.status === "APPROVED");
  const tpl = ctx.templates.find((t) => t.id === String(d.template_id)) || null;
  const ph = placeholdersOf(tpl?.components);
  const m: Mapping = d.mapping || { header: null, body: [], buttons: [] };
  const setMapping = (patch: Partial<Mapping>) => update({ mapping: { ...m, ...patch } });
  const choose = (id: string) => { const t = ctx.templates.find((x) => x.id === id); update({ template_id: id, mapping: guessMapping(t?.components) }); };
  const qr = templateButtons(tpl?.components);
  return (
    <>
      <div className="fp-field"><label>Templates</label>
        <select value={String(d.template_id || "")} onChange={(e) => choose(e.target.value)}>
          <option value="">Escolha um template aprovado…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {CATEGORY_LABEL[t.category || ""] || t.category || "—"} · {t.language}</option>)}
        </select>
        {tpl && <span className="fp-meta"><CatPill category={tpl.category} /><span>{tpl.language}</span><span>· a categoria define o preço da Meta</span></span>}
      </div>
      {!templates.length && <p className="err">Nenhum template aprovado nesta conta. Crie em Templates e rode "Sincronizar agora".</p>}
      {tpl && (
        <>
          <TemplateText components={tpl.components} />
          <MappingFields ph={ph} m={m} ctx={ctx} flow={flow} comps={tpl.components} setMapping={setMapping} />
          {qr.length > 0 && <p className="fp-note">Este template tem botões de resposta rápida: ligue “Próximo passo” a um bloco <b>Aguardar resposta</b> e use “Preencher com os botões”.</p>}
        </>
      )}
    </>
  );
}

/** Grupo de templates (randomizador): cada envio sorteia um template mantendo as porcentagens, por número. */
function GroupPanel({ node, ctx, flow, update, start, audience }: PanelProps) {
  const d = node.data || {};
  const approved = ctx.templates.filter((t) => t.status === "APPROVED");
  const group = groupOf(d);
  const byId = (id: string) => ctx.templates.find((t) => t.id === id);
  const split = phoneSplitOf(start?.data, flow.phone_number_id);
  const phoneName = (id: string) => ctx.catalog.phones.find((p) => p.id === id)?.display_phone_number || id;
  const m: Mapping = d.mapping || { header: null, body: [], buttons: [] };
  const setMapping = (patch: Partial<Mapping>) => update({ mapping: { ...m, ...patch } });
  const setGroup = (g: GroupEntry[]) => update({ group: g, template_id: g[0]?.template_id || "" });
  const withEqual = (g: GroupEntry[]) => { const eq = equalSplit(g.length); return g.map((e, i) => ({ ...e, pct: eq[i] })); };
  const add = (id: string) => {
    if (!id || group.some((e) => e.template_id === id)) return;
    const next = withEqual([...group, { template_id: id, pct: 0, phone_number_id: null }]);
    if (!group.length) update({ group: next, template_id: id, mapping: guessMapping(byId(id)?.components) }); else setGroup(next);
  };
  const addAll = () => {
    const missing = approved.filter((t) => !group.some((e) => e.template_id === t.id)).map((t) => ({ template_id: t.id, pct: 0, phone_number_id: null as string | null }));
    if (!missing.length) return;
    const next = withEqual([...group, ...missing]);
    if (!group.length) update({ group: next, template_id: next[0].template_id, mapping: guessMapping(byId(next[0].template_id)?.components) }); else setGroup(next);
  };
  const remove = (id: string) => setGroup(withEqual(group.filter((e) => e.template_id !== id)));
  const setPct = (id: string, pct: number) => setGroup(group.map((e) => (e.template_id === id ? { ...e, pct: Math.max(0, Math.min(100, Math.round(pct * 10) / 10)) } : e)));
  const setPhone = (id: string, pn: string) => setGroup(group.map((e) => (e.template_id === id ? { ...e, phone_number_id: pn || null } : e)));
  const sum = pctSum(group);
  const ok = Math.round(sum) === 100;
  const ref = group.map((e) => byId(e.template_id)).filter(Boolean).sort((a, b) => placeholdersOf(b!.components).body.length - placeholdersOf(a!.components).body.length)[0] || null;
  const ph = placeholdersOf(ref?.components);
  const cats = templateCategories(d, ctx);
  const total = audience?.total ?? null;
  const est = total != null ? estimateGroup(total, split, group) : null;
  const available = approved.filter((t) => !group.some((e) => e.template_id === t.id));
  return (
    <>
      <div className="fp-group">
        <div className="fp-group-head"><b>Templates do grupo <small>{group.length} de {approved.length}</small></b>
          <span style={{ display: "flex", gap: 10 }}>{available.length > 0 && <button type="button" className="fp-link" onClick={addAll}>+ Todos</button>}{group.length > 1 && <button type="button" className="fp-link" onClick={() => setGroup(withEqual(group))}>Igualar %</button>}</span>
        </div>
        {group.map((e) => {
          const t = byId(e.template_id);
          const n = est ? Math.round(est.per.get(e.template_id) || 0) : null;
          return (
            <div key={e.template_id} className="fp-row on">
              <span className="fp-row-main"><b title={t?.name || e.template_id}>{t?.name || e.template_id}</b><small><CatPill category={t?.category} />{t?.status && t.status !== "APPROVED" ? <span className="pill critical"><i aria-hidden />não aprovado</span> : null}{n != null ? <span className="num">≈ {fmtInt(n)} envios</span> : null}</small>
                {split.length > 1 && <select className="fp-mini" value={e.phone_number_id || ""} onChange={(ev) => setPhone(e.template_id, ev.target.value)}><option value="">Qualquer número</option>{split.map((p) => <option key={p.id} value={p.id}>Só no {phoneName(p.id)}</option>)}</select>}
              </span>
              <span className="pct-input"><input type="number" min={0} max={100} step={0.5} value={e.pct} onChange={(ev) => setPct(e.template_id, Number(ev.target.value))} aria-label="porcentagem" /><em>%</em></span>
              <button type="button" className="fp-x" onClick={() => remove(e.template_id)} aria-label="Tirar do grupo" title="Tirar do grupo"><FIcon name="close" size={14} stroke={2.2} /></button>
            </div>
          );
        })}
        {available.length > 0 && <select value="" onChange={(e) => add(e.target.value)} className="fp-add-select"><option value="">+ Adicionar template…</option>{available.map((t) => <option key={t.id} value={t.id}>{t.name} · {CATEGORY_LABEL[t.category || ""] || t.category} · {t.language}</option>)}</select>}
        {group.length > 0 && <p className={ok ? "ok" : "err"} style={{ margin: 0, fontSize: 12 }}>{ok ? `Soma 100 %${total != null ? ` · ${fmtInt(total)} contatos no público` : ""}` : `As porcentagens somam ${sum} % — use "Igualar %".`}</p>}
        {cats.length > 1 && <div className="notice warn">O grupo mistura categorias ({cats.map((c) => `${c.label} ×${c.count}`).join(", ")}): Marketing e Utilidade têm preços e regras diferentes.</div>}
      </div>
      {ref && (
        <>
          <p className="fp-note">As variáveis valem para todos os templates do grupo, pela posição ({"{{1}}"}, {"{{2}}"}…). Referência: <b>{ref.name}</b>.</p>
          <MappingFields ph={ph} m={m} ctx={ctx} flow={flow} comps={ref.components} setMapping={setMapping} />
        </>
      )}
    </>
  );
}

// ---------- Mensagem ----------

function MessagePanel({ node, flow, update }: PanelProps) {
  const d = node.data || {};
  const kind = d.kind || "text";
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const upload = async (file: File) => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData(); fd.set("file", file); fd.set("phone_number_id", flow.phone_number_id);
      const r = await fetch("/api/media/upload", { method: "POST", body: fd }); const up = await r.json();
      if (!r.ok) throw new Error(up.error || "Falha no upload");
      if (up.id) localMedia.set(String(up.id), URL.createObjectURL(file));
      update({ media: { id: up.id, mime: up.mime || file.type, filename: up.filename || file.name } });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const buttons: { id: string; title: string }[] = d.buttons || [];
  const rows: { id: string; title: string; description?: string }[] = d.rows || [];
  const media = ["image", "video", "document", "audio"].includes(kind);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState(false);
  const insert = (token: string) => {
    const el = textRef.current; const text = String(d.text || "");
    const a = el?.selectionStart ?? text.length, b = el?.selectionEnd ?? text.length;
    update({ text: text.slice(0, a) + `{{${token}}}` + text.slice(b) }); setMenu(false);
    requestAnimationFrame(() => { if (!el) return; el.focus(); const pos = a + token.length + 4; el.setSelectionRange(pos, pos); });
  };
  return (
    <>
      <div className="fp-field"><label>Tipo de mensagem</label>
        <div className="fp-kinds">
          {MESSAGE_KINDS.map((k) => <button key={k.k} type="button" className={kind === k.k ? "on" : ""} onClick={() => update({ kind: k.k })}><FIcon name={k.icon} size={16} />{k.label}</button>)}
        </div>
      </div>
      {media && (
        <div className="fp-field"><label>Arquivo</label>
          <div className="fp-file">
            <span className="fp-file-ico">{kind === "image" && d.media?.id && mediaSrc(d.media.id) ? <img src={mediaSrc(d.media.id)!} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <FIcon name={MESSAGE_KINDS.find((x) => x.k === kind)?.icon || "doc"} size={18} />}</span>
            <span className="fp-file-name">{d.media?.id ? d.media.filename || "arquivo enviado" : "Nenhum arquivo"}</span>
            <button type="button" className="btn small tint" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Enviando…" : d.media?.id ? "Trocar" : "Escolher"}</button>
            <input ref={fileRef} type="file" hidden accept={kind === "image" ? "image/jpeg,image/png" : kind === "video" ? "video/mp4" : kind === "audio" ? "audio/*" : "*/*"} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
          {err && <span className="err">{err}</span>}
        </div>
      )}
      {(kind === "buttons" || kind === "list") && <div className="fp-field"><label>Título (opcional)</label><input value={d.header || ""} onChange={(e) => update({ header: e.target.value })} maxLength={60} /></div>}
      {kind !== "audio" && (
        <div className="fp-field"><label>{media ? "Legenda (opcional)" : "Texto"}</label>
          <div className="pf-box">
            <textarea ref={textRef} rows={5} value={d.text || ""} onChange={(e) => update({ text: e.target.value })} placeholder="Olá {{primeiro_nome}}! …" />
            <button type="button" className="pf-var" onClick={() => setMenu(!menu)} title="Inserir dado do contato">{"{ }"}</button>
            {menu && (
              <div className="pf-menu" onMouseLeave={() => setMenu(false)}>
                {[["nome", "Nome do contato"], ["primeiro_nome", "Primeiro nome"], ["telefone", "Telefone"], ["email", "E-mail"], ["resposta", "Última resposta"]].map(([t, l]) => <button key={t} type="button" onClick={() => insert(t)}><span>{l}</span><code>{`{{${t}}}`}</code></button>)}
              </div>
            )}
          </div>
          <span className="fp-hint">Use *negrito*, _itálico_ e ~riscado~ como no WhatsApp.</span>
        </div>
      )}
      {kind === "buttons" && (
        <div className="fp-field"><label>Botões (até 3, 20 letras cada)</label>
          {buttons.map((b, i) => <div key={i} className="fp-inline"><input value={b.title} maxLength={20} placeholder={`Botão ${i + 1}`} onChange={(e) => update({ buttons: buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><button className="fp-x" type="button" onClick={() => update({ buttons: buttons.filter((_, j) => j !== i) })} aria-label="Remover"><FIcon name="close" size={14} stroke={2.2} /></button></div>)}
          {buttons.length < 3 && <button className="fp-dashed" type="button" onClick={() => update({ buttons: [...buttons, { id: `b${buttons.length + 1}_${Date.now().toString(36).slice(-3)}`, title: "" }] })}><FIcon name="plus" size={14} stroke={2.2} />Adicionar botão</button>}
        </div>
      )}
      {kind === "list" && (
        <>
          <div className="fp-field"><label>Texto do botão que abre a lista</label><input value={d.list_button || ""} maxLength={20} onChange={(e) => update({ list_button: e.target.value })} placeholder="Ver opções" /></div>
          <div className="fp-field"><label>Opções (até 10)</label>
            {rows.map((r, i) => <div key={i} className="fp-inline two"><input value={r.title} maxLength={24} placeholder={`Opção ${i + 1}`} onChange={(e) => update({ rows: rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><input value={r.description || ""} maxLength={72} placeholder="descrição (opcional)" onChange={(e) => update({ rows: rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} /><button className="fp-x" type="button" onClick={() => update({ rows: rows.filter((_, j) => j !== i) })} aria-label="Remover"><FIcon name="close" size={14} stroke={2.2} /></button></div>)}
            {rows.length < 10 && <button className="fp-dashed" type="button" onClick={() => update({ rows: [...rows, { id: `r${rows.length + 1}_${Date.now().toString(36).slice(-3)}`, title: "" }] })}><FIcon name="plus" size={14} stroke={2.2} />Adicionar opção</button>}
          </div>
        </>
      )}
      {(kind === "buttons" || kind === "list") && <div className="fp-field"><label>Rodapé (opcional)</label><input value={d.footer || ""} onChange={(e) => update({ footer: e.target.value })} maxLength={60} /></div>}
      <p className="fp-note">Se a janela de 24 h estiver fechada, o contato segue pela saída “Janela de 24 h fechada” — ligue-a a um bloco de template, por exemplo.</p>
    </>
  );
}

// ---------- Aguardar resposta ----------

function WaitPanel({ node, ctx, update, incoming }: PanelProps) {
  const d = node.data || {};
  const options: { id: string; label: string; match: string; value: string }[] = d.options || [];
  const set = (i: number, patch: any) => update({ options: options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const prevButtons = incoming.flatMap((n) => {
    if (n.type === "message" && n.data?.kind === "buttons") return (n.data.buttons || []).map((b: any) => String(b.title || "")).filter(Boolean);
    if (n.type === "message" && n.data?.kind === "list") return (n.data.rows || []).map((b: any) => String(b.title || "")).filter(Boolean);
    if (n.type === "template") return templateButtons(ctx.templates.find((t) => t.id === String(n.data?.template_id))?.components);
    return [];
  });
  const fill = () => update({ options: prevButtons.map((t, i) => ({ id: `o${i + 1}_${Date.now().toString(36).slice(-3)}`, label: t, match: "button", value: t })) });
  return (
    <>
      <div className="fp-field"><label>Quanto tempo esperar a resposta?</label><select value={Number(d.timeout || 0)} onChange={(e) => update({ timeout: Number(e.target.value) })}>{TIMEOUTS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select><span className="fp-hint">Passado o prazo, o contato segue por “Sem resposta no prazo”.</span></div>
      <div className="fp-field"><label>Opções (cada uma vira uma saída)</label>
        {options.map((o, i) => (
          <div key={o.id} className="fp-card">
            <div className="fp-inline"><input value={o.label} placeholder="Nome da saída (ex.: Estou aqui)" onChange={(e) => set(i, { label: e.target.value, value: o.match === "button" && o.value === o.label ? e.target.value : o.value })} /><button className="fp-x" type="button" onClick={() => update({ options: options.filter((_, j) => j !== i) })} aria-label="Remover opção"><FIcon name="trash" size={15} /></button></div>
            <div className="fp-inline two">
              <select value={o.match} onChange={(e) => set(i, { match: e.target.value })}><option value="button">clicou no botão</option><option value="contains">resposta contém</option><option value="any">qualquer resposta</option></select>
              {o.match !== "any" ? <input value={o.value} placeholder={o.match === "button" ? "texto do botão" : "palavra ou trecho"} onChange={(e) => set(i, { value: e.target.value })} /> : <span />}
            </div>
          </div>
        ))}
        <button className="fp-dashed" type="button" onClick={() => update({ options: [...options, { id: `o${options.length + 1}_${Date.now().toString(36).slice(-3)}`, label: "", match: "contains", value: "" }] })}><FIcon name="plus" size={14} stroke={2.2} />Adicionar opção</button>
        {prevButtons.length > 0 && <button className="fp-dashed tint" type="button" onClick={fill}><FIcon name="reply" size={15} />Preencher com os botões do bloco anterior ({prevButtons.length})</button>}
      </div>
      <p className="fp-note">Além das opções, o bloco sempre tem “Outra resposta”{Number(d.timeout) > 0 ? " e “Sem resposta no prazo”" : ""}. Saídas sem ligação encerram a execução.</p>
    </>
  );
}

// ---------- Condição ----------

function ConditionPanel({ node, ctx, update }: PanelProps) {
  const d = node.data || {};
  const c = ctx.catalog;
  const tagIds: number[] = (Array.isArray(d.tag_ids) && d.tag_ids.length ? d.tag_ids : d.tag_id ? [d.tag_id] : []).map(Number);
  const toggleTag = (id: number) => { const next = tagIds.includes(id) ? tagIds.filter((x) => x !== id) : [...tagIds, id]; update({ tag_ids: next, tag_id: next[0] || "" }); };
  return (
    <>
      <div className="fp-field"><label>Regra</label>
        <select value={d.kind || "tag"} onChange={(e) => update({ kind: e.target.value, op: e.target.value === "tag" || e.target.value === "list" ? "has" : "filled" })}>
          <option value="tag">Verifica se o lead possui uma tag</option><option value="list">Verifica se o lead está em uma lista</option><option value="field">Campo do contato</option>
          <option value="reply">Última resposta</option><option value="replied">Já respondeu neste fluxo</option><option value="optout">Pediu para não receber</option>
        </select>
      </div>
      {(d.kind || "tag") === "tag" && (
        <>
          <div className="seg seg-full"><a className={d.op !== "not" ? "on" : ""} onClick={() => update({ op: "has" })}>Possui</a><a className={d.op === "not" ? "on" : ""} onClick={() => update({ op: "not" })}>Não possui</a></div>
          <div className="fp-field"><label>Selecione as tags para verificar se existem no lead</label>
            <div className="chips">{c.tags.map((t) => <button key={t.id} type="button" className={`chip pick ${tagIds.includes(t.id) ? "on" : ""}`} onClick={() => toggleTag(t.id)}>{t.name}</button>)}{!c.tags.length && <span className="fp-note">Nenhuma tag ainda.</span>}</div>
            <span className="fp-hint">{d.op === "not" ? "Será verdadeiro se o lead não possuir nenhuma das tags informadas." : "Será verdadeiro se o lead possuir pelo menos uma das tags informadas."}</span>
          </div>
        </>
      )}
      {d.kind === "list" && (
        <>
          <div className="seg seg-full"><a className={d.op !== "not" ? "on" : ""} onClick={() => update({ op: "has" })}>Está na lista</a><a className={d.op === "not" ? "on" : ""} onClick={() => update({ op: "not" })}>Não está</a></div>
          <div className="fp-field"><label>Lista</label><select value={d.list_id || ""} onChange={(e) => update({ list_id: e.target.value })}><option value="">Escolha…</option>{c.lists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        </>
      )}
      {(d.kind === "field" || d.kind === "reply") && (
        <>
          {d.kind === "field" && <div className="fp-field"><label>Campo</label><select value={d.field || "name"} onChange={(e) => update({ field: e.target.value })}>{ctx.options.fields.filter((f) => f.value !== "first_name").map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>}
          <div className="fp-field"><label>Condição</label><select value={d.op || "filled"} onChange={(e) => update({ op: e.target.value })}><option value="filled">está preenchido</option><option value="empty">está vazio</option><option value="equals">é igual a</option><option value="contains">contém</option></select></div>
          {(d.op === "equals" || d.op === "contains") && <div className="fp-field"><label>Valor</label><input value={d.value || ""} onChange={(e) => update({ value: e.target.value })} /></div>}
        </>
      )}
      <p className="fp-note">Ligue “Se a condição for verdadeira” e “Quando não atender à condição” aos próximos blocos.</p>
    </>
  );
}

// ---------- Ações ----------

function ActionPanel({ node, ctx, update }: PanelProps) {
  const d = node.data || {};
  const actions: any[] = d.actions || [];
  const c = ctx.catalog;
  const set = (i: number, patch: any) => update({ actions: actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <>
      {actions.map((a, i) => (
        <div key={i} className="fp-card">
          <div className="fp-inline">
            <select value={a.type} onChange={(e) => set(i, { type: e.target.value })}>
              {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button className="fp-x" type="button" onClick={() => update({ actions: actions.filter((_, j) => j !== i) })} aria-label="Remover ação"><FIcon name="trash" size={15} /></button>
          </div>
          {(a.type === "add_tag" || a.type === "remove_tag") && <select value={a.tag_id || ""} onChange={(e) => set(i, { tag_id: e.target.value })}><option value="">Escolha a tag…</option>{c.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
          {(a.type === "add_list" || a.type === "remove_list") && <select value={a.list_id || ""} onChange={(e) => set(i, { list_id: e.target.value })}><option value="">Escolha a lista…</option>{c.lists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
          {a.type === "set_department" && <select value={a.department_id || ""} onChange={(e) => set(i, { department_id: e.target.value })}><option value="">Nenhum</option>{c.departments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
          {a.type === "assign_user" && <select value={a.user_id || ""} onChange={(e) => set(i, { user_id: e.target.value })}><option value="">Ninguém</option>{ctx.options.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
          {a.type === "set_field" && <div className="fp-inline two"><input value={a.field || ""} placeholder="campo (ex.: interesse)" onChange={(e) => set(i, { field: e.target.value })} /><input value={a.value || ""} placeholder="valor (pode usar {{resposta}})" onChange={(e) => set(i, { value: e.target.value })} /></div>}
        </div>
      ))}
      <button className="fp-dashed" type="button" onClick={() => update({ actions: [...actions, { type: "add_tag", tag_id: "" }] })}><FIcon name="plus" size={14} stroke={2.2} />Adicionar ação</button>
    </>
  );
}

// ---------- Espera ----------

function DelayPanel({ node, update }: PanelProps) {
  const d = node.data || {};
  return (
    <>
      <div className="fp-field"><label>Quanto tempo esperar para continuar a execução?</label>
        <div className="fp-inline amount">
          <input type="number" min={1} value={d.amount ?? 1} onChange={(e) => update({ amount: Number(e.target.value) })} />
          <select value={d.unit || "hours"} onChange={(e) => update({ unit: e.target.value })}><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select>
        </div>
      </div>
      <label className="check fp-switch"><input type="checkbox" checked={!!d.business_hours} onChange={(e) => update({ business_hours: e.target.checked })} /> Continuar só em horário comercial (seg–sex, 8h–18h)</label>
      <p className="fp-note">A continuação acontece em até 10 minutos depois do prazo. Lembre que mensagens livres precisam da janela de 24 h aberta.</p>
    </>
  );
}

// ---------- Randomizador ----------

/** Ajusta uma ramificação e redistribui a diferença entre as outras, mantendo a soma em 100. */
export function rebalance(list: SplitBranch[], i: number, v: number): SplitBranch[] {
  const val = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  const out = list.map((b) => ({ ...b }));
  const idx = list.map((_, j) => j).filter((j) => j !== i);
  if (!idx.length) { out[i].pct = val; return out; }
  const restNow = 100 - val;
  const restWas = idx.reduce((a, j) => a + list[j].pct, 0);
  const shares = idx.map((j) => (restWas > 0 ? Math.floor((list[j].pct / restWas) * restNow) : Math.floor(restNow / idx.length)));
  let left = restNow - shares.reduce((a, x) => a + x, 0);
  for (let k = shares.length - 1; left > 0; k = (k - 1 + shares.length) % shares.length) { shares[k] += 1; left -= 1; } // sobra do arredondamento
  out[i].pct = val;
  idx.forEach((j, k) => { out[j].pct = shares[k]; });
  return out;
}

function SplitPanel({ node, update }: PanelProps) {
  const branches = splitBranchesOf(node.data);
  const set = (list: SplitBranch[]) => update({ branches: list });
  const sum = pctSum(branches);
  const add = () => {
    const n = branches.length + 1;
    const eq = equalSplit(n);
    set([...branches, { id: `r${Date.now().toString(36)}${n}`, label: String.fromCharCode(64 + n), pct: 0 }].map((b, i) => ({ ...b, pct: eq[i] })));
  };
  return (
    <>
      {branches.map((b, i) => (
        <div key={b.id} className="fp-slider" style={{ ["--c" as any]: BRANCH_COLORS[i % BRANCH_COLORS.length] }}>
          <input className="fp-slider-l" value={b.label} maxLength={12} onChange={(e) => set(branches.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Nome da ramificação" />
          <input type="range" min={0} max={100} value={b.pct} onChange={(e) => set(rebalance(branches, i, Number(e.target.value)))} style={{ ["--p" as any]: `${b.pct}%` }} aria-label={`Porcentagem de ${b.label}`} />
          <span className="pct-input"><input type="number" min={0} max={100} value={b.pct} onChange={(e) => set(rebalance(branches, i, Number(e.target.value)))} aria-label="porcentagem" /><em>%</em></span>
          {branches.length > 2 && <button type="button" className="fp-x" onClick={() => { const rest = branches.filter((_, j) => j !== i); const eq = equalSplit(rest.length); set(rest.map((x, j) => ({ ...x, pct: eq[j] }))); }} aria-label="Remover ramificação"><FIcon name="close" size={14} stroke={2.2} /></button>}
        </div>
      ))}
      {branches.length < 8 && <button type="button" className="fp-dashed" onClick={add}><FIcon name="plus" size={14} stroke={2.2} />Adicionar ramificação</button>}
      {branches.length > 1 && <button type="button" className="fp-link" onClick={() => { const eq = equalSplit(branches.length); set(branches.map((b, i) => ({ ...b, pct: eq[i] }))); }}>Dividir igualmente</button>}
      <p className={Math.round(sum) === 100 ? "ok" : "err"} style={{ margin: 0, fontSize: 12 }}>{Math.round(sum) === 100 ? "Soma 100 % · o Ecossistema distribui os contatos exatamente nessas proporções." : `As porcentagens somam ${sum} % — precisam somar 100 %.`}</p>
    </>
  );
}

// ---------- Atendimento humano ----------

function HandoffPanel({ node, ctx, update }: PanelProps) {
  const d = node.data || {};
  return (
    <>
      <div className="fp-field"><label>Departamento</label><select value={d.department_id || ""} onChange={(e) => update({ department_id: e.target.value })}><option value="">Manter o atual</option>{ctx.catalog.departments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <div className="fp-field"><label>Atendente</label><select value={d.user_id || ""} onChange={(e) => update({ user_id: e.target.value })}><option value="">Sem atendente fixo</option>{ctx.options.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      <div className="fp-field"><label>Observação para a equipe (opcional)</label><input value={d.note || ""} onChange={(e) => update({ note: e.target.value })} placeholder="ex.: Lead quente — respondeu Quero" /></div>
    </>
  );
}

// ---------- prévia no celular ----------

/** Texto com {{nome}}, {{primeiro_nome}}… trocados pelo contato de exemplo; {{resposta}} fica destacado. */
const fillSample = (text: string, c: SampleContact) => fillTokens(text, c, { last_reply: "{{resposta}}" });

export function hasPreview(node: FlowNode | null) {
  return !!node && (node.type === "template" || node.type === "message");
}

/** Prévia do bloco selecionado (template único, grupo de templates ou mensagem) no iPhone. */
export function NodePreview({ node, ctx, business, sample, sampleOptions, onSample }: { node: FlowNode; ctx: Ctx; business: string; sample: SampleContact; sampleOptions: { phone: string; name: string | null }[]; onSample: (s: SampleContact) => void }) {
  const d = node.data || {};
  const group = node.type === "template" ? groupOf(d) : [];
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [node.id]);
  const msg: PreviewMsg | null = useMemo(() => {
    if (node.type === "template") {
      const ids = group.length ? group.map((e) => e.template_id) : d.template_id ? [String(d.template_id)] : [];
      const t = ctx.templates.find((x) => x.id === ids[Math.min(idx, ids.length - 1)]);
      if (!t) return null;
      const ph = placeholdersOf(t.components);
      const m: Mapping = group.length ? adaptMapping((d.mapping || { body: [] }) as Mapping, ph) : (d.mapping || { header: null, body: [], buttons: [] });
      const body = previewFor(t.components, ph, m, sample);
      const h = m.header as any;
      const headerText = h?.kind === "text" ? (resolveSource(h.source, sample) || `{{${ph.header.keys[0]}}}`) : null;
      const raw = (t.components || []).find((c: any) => c?.type === "HEADER");
      const htext = raw && String(raw.format || "TEXT").toUpperCase() === "TEXT" ? String(raw.text || "").replace(/\{\{\s*[\w.]+\s*\}\}/, headerText || "$&") : null;
      return templatePreview(t.components, { body, headerText: htext, headerSrc: mediaSrc(h?.media_id), headerFile: h?.filename || null });
    }
    if (node.type === "message") {
      const kind = d.kind || "text";
      const text = fillSample(String(d.text || ""), sample);
      if (["image", "video", "document", "audio"].includes(kind)) {
        return { header: { kind: kind === "audio" ? "document" : kind, src: mediaSrc(d.media?.id), filename: kind === "audio" ? `Áudio · ${d.media?.filename || "envie o arquivo"}` : d.media?.filename || null }, body: kind === "audio" ? "" : text } as PreviewMsg;
      }
      return {
        header: (kind === "buttons" || kind === "list") && d.header ? { kind: "text", text: d.header } : null,
        body: text, footer: (kind === "buttons" || kind === "list") ? d.footer || null : null,
        buttons: kind === "buttons" ? (d.buttons || []).filter((b: any) => String(b.title || "").trim()).map((b: any) => ({ type: "reply" as const, text: b.title })) : [],
        listButton: kind === "list" ? (d.list_button || "Ver opções") : null,
      };
    }
    return null;
  }, [node, ctx.templates, group, idx, sample, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = sampleOptions.filter((s) => s.name).slice(0, 8);
  return (
    <div className="fphone">
      <div className="fphone-head">
        <b>Como o lead vai receber</b>
        <select value={sample.phone} onChange={(e) => { const p = people.find((x) => x.phone === e.target.value); onSample(p ? { ...SAMPLE, name: p.name, phone: p.phone } as SampleContact : SAMPLE); }} aria-label="Ver como">
          <option value={SAMPLE.phone}>Exemplo: {SAMPLE.name}</option>
          {people.map((p) => <option key={p.phone} value={p.phone}>{p.name}</option>)}
        </select>
      </div>
      {msg ? <PhonePreview msg={msg} business={business} /> : <div className="fphone-empty"><FIcon name="whatsapp" size={28} /><span>Escolha um template para ver a prévia.</span></div>}
      {group.length > 1 && (
        <div className="fphone-pager">
          <button type="button" onClick={() => setIdx((idx - 1 + group.length) % group.length)} aria-label="Template anterior"><FIcon name="chevronLeft" size={16} stroke={2.2} /></button>
          <span>Template {Math.min(idx, group.length - 1) + 1} de {group.length} · {ctx.templates.find((x) => x.id === group[Math.min(idx, group.length - 1)]?.template_id)?.name}</span>
          <button type="button" onClick={() => setIdx((idx + 1) % group.length)} aria-label="Próximo template"><FIcon name="chevronRight" size={16} stroke={2.2} /></button>
        </div>
      )}
    </div>
  );
}
