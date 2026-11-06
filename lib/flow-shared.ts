// Fluxos: tipos e funções puras compartilhadas entre servidor e telas (sem acesso a banco).
import { fillTokens, placeholdersOf, type Mapping } from "./template-vars";

export type NodeType = "start" | "template" | "message" | "wait" | "condition" | "action" | "delay" | "handoff" | "split" | "end";
export type FlowNode = { id: string; type: NodeType; x: number; y: number; data: any };
export type FlowEdge = { id: string; from: string; port: string; to: string };
export type Graph = { nodes: FlowNode[]; edges: FlowEdge[] };
export type FlowStatus = "draft" | "active" | "paused" | "archived";
export type Flow = {
  id: number; name: string; waba_id: string; phone_number_id: string; status: FlowStatus; graph: Graph; settings: Record<string, any>;
  lock_until: string | null; last_error: string | null; created_by: number | null; created_at: string; updated_at: string;
};
export type RunStatus = "queued" | "running" | "waiting_reply" | "waiting_time" | "done" | "failed" | "cancelled" | "stopped";
export type FlowRun = {
  id: number; flow_id: number; contact_id: number; phone: string; conversation_id: number | null; node_id: string | null; status: RunStatus;
  vars: Record<string, any>; next_at: string | null; wait_node_id: string | null; wait_until: string | null; last_wamid: string | null;
  last_error: string | null; is_test: boolean; started_at: string | null; finished_at: string | null; created_at: string; updated_at: string;
  phone_number_id?: string | null;
};

// ---------- randomizadores (números no Início, grupo de templates no bloco Enviar template) ----------

export type PhoneSplit = { id: string; pct: number };
export type GroupEntry = { template_id: string; pct: number; phone_number_id?: string | null };

/** Divide 100 % em n partes inteiras que somam exatamente 100 (as primeiras ficam com o resto). */
export function equalSplit(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n), rest = 100 - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Números de envio do fluxo: os do bloco Início (com %), ou só o número principal. */
export function phoneSplitOf(startData: any, mainPhoneId: string): PhoneSplit[] {
  const list = (Array.isArray(startData?.phones) ? startData.phones : []) as any[];
  const clean = list.map((p) => ({ id: String(p?.id || ""), pct: Math.max(0, Number(p?.pct) || 0) })).filter((p) => p.id);
  if (!clean.length) return [{ id: mainPhoneId, pct: 100 }];
  return clean;
}

/** Entradas do grupo de templates de um bloco Enviar template (modo "group"); vazio no modo de template único. */
export function groupOf(d: any): GroupEntry[] {
  if (d?.mode !== "group") return [];
  const list = (Array.isArray(d?.group) ? d.group : []) as any[];
  return list.map((e) => ({ template_id: String(e?.template_id || ""), pct: Math.max(0, Number(e?.pct) || 0), phone_number_id: e?.phone_number_id ? String(e.phone_number_id) : null })).filter((e) => e.template_id);
}

export const pctSum = (xs: { pct: number }[]) => xs.reduce((a, x) => a + (Number(x.pct) || 0), 0);

/** Round-robin ponderado "suave": distribui n posições na proporção dos pesos, intercalando (ex.: 50/50 → A B A B…). */
export function wrrAssign<T extends { id: string; pct: number }>(items: T[], n: number): string[] {
  const live = items.filter((i) => i.pct > 0);
  if (!live.length) return Array.from({ length: n }, () => items[0]?.id || "");
  const total = live.reduce((a, i) => a + i.pct, 0);
  const cur = live.map(() => 0);
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    let best = 0;
    for (let i = 0; i < live.length; i++) { cur[i] += live[i].pct; if (cur[i] > cur[best]) best = i; }
    cur[best] -= total;
    out.push(live[best].id);
  }
  return out;
}

/** Escolhe o próximo item mantendo as porcentagens: o que está mais "atrasado" em relação ao peso (empate → aleatório). */
export function pickBalanced<T extends { pct: number }>(items: T[], countOf: (item: T) => number): T | null {
  const live = items.filter((i) => i.pct > 0);
  if (!live.length) return items[0] || null;
  let best: T[] = [], bestScore = Infinity;
  for (const it of live) {
    const score = (countOf(it) + 1) / it.pct;
    if (score < bestScore - 1e-9) { best = [it]; bestScore = score; } else if (Math.abs(score - bestScore) <= 1e-9) best.push(it);
  }
  return best[Math.floor(Math.random() * best.length)];
}

/** Adapta o mapeamento (definido no template de referência) a outro template do grupo: por nome da variável e, se não houver, pela posição. */
export function adaptMapping(mapping: Mapping, ph: ReturnType<typeof placeholdersOf>): Mapping {
  const bodySrc = mapping.body || [];
  const body = ph.body.map((key, i) => {
    const byName = bodySrc.find((b) => b.key === key);
    const src = byName || bodySrc[i];
    return src ? { ...src, key } : { key, kind: "text" as const, value: "", fallback: "" };
  });
  let header = mapping.header || null;
  if (ph.header.kind === "none" || ph.header.kind === "location") header = null;
  else if (ph.header.kind === "text") header = ph.header.keys.length ? (header?.kind === "text" ? { kind: "text", source: { ...header.source, key: ph.header.keys[0] } } : { kind: "text", source: body[0] ? { ...body[0], key: ph.header.keys[0] } : { key: ph.header.keys[0], kind: "text", value: "", fallback: "" } }) : null;
  else header = header && header.kind !== "text" ? { ...header, kind: ph.header.kind } : null;
  const buttons = ph.buttons.map((b, i) => { const m = (mapping.buttons || []).find((x) => x.index === b.index) || (mapping.buttons || [])[i]; return m ? { ...m, index: b.index, sub_type: b.sub_type } : { index: b.index, sub_type: b.sub_type, source: { key: `btn${b.index}`, kind: "text" as const, value: "", fallback: "" } }; });
  return { header, body, buttons };
}

export const FLOW_STATUS: Record<string, string> = { draft: "Rascunho", active: "Ativo", paused: "Pausado", archived: "Arquivado" };
export const RUN_STATUS: Record<string, string> = {
  queued: "Na fila", running: "Em andamento", waiting_reply: "Aguardando resposta", waiting_time: "Aguardando prazo",
  done: "Concluído", failed: "Falhou", cancelled: "Cancelado", stopped: "Interrompido",
};
export const NODE_LABEL: Record<NodeType, string> = {
  start: "Início", template: "Template do WhatsApp", message: "Mensagem", wait: "Aguardar resposta", condition: "Condição",
  action: "Ações", delay: "Espera", handoff: "Atendimento humano", split: "Randomizador", end: "Fim",
};

/** Ramificações de um Randomizador (bloco "split"): id da saída, nome e porcentagem. */
export type SplitBranch = { id: string; label: string; pct: number };
export function splitBranchesOf(d: any): SplitBranch[] {
  const list = (Array.isArray(d?.branches) ? d.branches : []) as any[];
  return list.map((b, i) => ({ id: String(b?.id || `r${i + 1}`), label: String(b?.label || String.fromCharCode(65 + i)), pct: Math.max(0, Number(b?.pct) || 0) })).filter((b) => b.id);
}

// ---------- grafo ----------

export const PORT_NEXT = "Próximo passo";
export const PORT_ERROR = "Caso ocorrer erro no envio";

export function portsOf(n: FlowNode): { id: string; label: string }[] {
  switch (n.type) {
    case "start": return [{ id: "out", label: triggersOf(n.data).length ? "Quando o evento ocorrer, então" : "Para cada contato, então" }];
    case "template": return [{ id: "out", label: PORT_NEXT }, { id: "error", label: PORT_ERROR }];
    case "message": return [{ id: "out", label: PORT_NEXT }, { id: "closed", label: "Janela de 24 h fechada" }, { id: "error", label: PORT_ERROR }];
    case "action": case "delay": case "handoff": return [{ id: "out", label: PORT_NEXT }];
    case "wait": return [...((n.data?.options || []) as any[]).map((o) => ({ id: String(o.id), label: String(o.label || o.value || "Opção") })), { id: "other", label: "Outra resposta" }, ...(Number(n.data?.timeout) > 0 ? [{ id: "timeout", label: "Sem resposta no prazo" }] : [])];
    case "condition": return [{ id: "yes", label: "Se a condição for verdadeira" }, { id: "no", label: "Quando não atender à condição" }];
    case "split": return splitBranchesOf(n.data).map((b) => ({ id: b.id, label: `${b.label} · ${fmtPctShort(b.pct)}` }));
    case "end": return [];
  }
}
const fmtPctShort = (v: number) => `${String(Math.round(v * 10) / 10).replace(".", ",")}%`;

/** Confere o grafo antes de salvar/ativar. Devolve a lista de problemas (vazia = ok). */
export function validateGraph(g: Graph, templates: { id: string; status: string | null; components: any[] | null; name?: string }[], phones?: { id: string }[]): string[] {
  const errs: string[] = [];
  const starts = g.nodes.filter((n) => n.type === "start");
  if (starts.length !== 1) errs.push(starts.length ? "O fluxo só pode ter um bloco Início" : "Falta o bloco Início");
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const e of g.edges) if (!ids.has(e.from) || !ids.has(e.to)) errs.push("Há uma ligação apontando para um bloco que não existe");
  // alcançáveis a partir do início
  if (starts.length === 1) {
    const seen = new Set<string>([starts[0].id]);
    const stack = [starts[0].id];
    while (stack.length) { const cur = stack.pop()!; for (const e of g.edges) if (e.from === cur && !seen.has(e.to)) { seen.add(e.to); stack.push(e.to); } }
    for (const n of g.nodes) if (!seen.has(n.id)) errs.push(`O bloco "${NODE_LABEL[n.type]}${n.data?.title ? ` · ${n.data.title}` : ""}" está solto (não liga ao Início)`);
    const next = g.edges.find((e) => e.from === starts[0].id);
    if (!next) errs.push("O bloco Início precisa ligar ao primeiro bloco");
  }
  for (const n of g.nodes) {
    const d = n.data || {};
    if (n.type === "start") {
      if (phones && triggersOf(d).some((t) => t.phone_number_id && !phones.find((x) => x.id === t.phone_number_id))) errs.push("No gatilho “Mensagem recebida”, o número escolhido não é desta conta");
      const split = phoneSplitOf(d, "");
      if (Array.isArray(d.phones) && d.phones.length) {
        if (Math.round(pctSum(split)) !== 100) errs.push("No bloco Início, as porcentagens dos números precisam somar 100 %");
        if (phones && split.some((p) => !phones.find((x) => x.id === p.id))) errs.push("No bloco Início há um número que não é desta conta");
      }
    }
    if (n.type === "template") {
      const label = d.title ? `"${d.title}"` : "Template do WhatsApp";
      const group = groupOf(d);
      const m: Mapping = d.mapping || { body: [] };
      const checkVars = (t: { components: any[] | null; name?: string }, mm: Mapping, who: string) => {
        const ph = placeholdersOf(t.components);
        for (const k of ph.body) { const b = (mm.body || []).find((x) => x.key === k); if (!b || !(b.kind === "text" ? b.value?.trim() : b.value || b.fallback)) errs.push(`Variável {{${k}}} ${who} sem valor`); }
        if (["image", "video", "document"].includes(ph.header.kind) && !(mm.header as any)?.media_id) errs.push(`${who[0].toUpperCase()}${who.slice(1)} tem cabeçalho de mídia: envie o arquivo no bloco`);
      };
      if (d.mode === "group") {
        if (!group.length) errs.push(`O bloco ${label} está no modo grupo mas sem templates`);
        else {
          if (Math.round(pctSum(group)) !== 100) errs.push(`No bloco ${label}, as porcentagens dos templates precisam somar 100 %`);
          for (const e of group) {
            const t = templates.find((x) => x.id === e.template_id);
            if (!t) { errs.push(`No bloco ${label} há um template que não existe mais`); continue; }
            if (t.status !== "APPROVED") { errs.push(`O template ${t.name || t.id} (bloco ${label}) não está aprovado`); continue; }
            checkVars(t, adaptMapping(m, placeholdersOf(t.components)), `do template ${t.name || t.id}`);
          }
        }
      } else {
        const t = templates.find((x) => x.id === String(d.template_id));
        if (!t) errs.push("Um bloco Template do WhatsApp está sem template escolhido");
        else if (t.status !== "APPROVED") errs.push(`O template ${t.name || t.id} não está aprovado`);
        else checkVars(t, m, "do template");
      }
    }
    if (n.type === "message") {
      if (!String(d.text || "").trim() && !d.media?.id) errs.push("Um bloco Mensagem está sem texto");
      if (d.kind === "buttons" && !(d.buttons || []).some((b: any) => String(b.title || "").trim())) errs.push("Um bloco Mensagem com botões está sem botões");
      if (d.kind === "list" && !(d.rows || []).some((b: any) => String(b.title || "").trim())) errs.push("Um bloco Mensagem com lista está sem opções");
    }
    if (n.type === "wait" && !(d.options || []).length) errs.push("Um bloco Aguardar resposta está sem opções (adicione pelo menos uma ou use só \"outra resposta\")");
    if (n.type === "condition" && !d.kind) errs.push("Um bloco Condição está sem regra");
    if (n.type === "condition" && d.kind === "tag" && !(Array.isArray(d.tag_ids) && d.tag_ids.length) && !d.tag_id) errs.push("Um bloco Condição está sem tag escolhida");
    if (n.type === "action" && !(d.actions || []).length) errs.push("Um bloco Ações está sem ações");
    if (n.type === "delay" && !(Number(d.amount) > 0)) errs.push("Um bloco Espera está sem tempo");
    if (n.type === "split") {
      const br = splitBranchesOf(d);
      const label = d.title ? `"${d.title}"` : "Randomizador";
      if (br.length < 2) errs.push(`O bloco ${label} precisa de pelo menos 2 ramificações`);
      else if (Math.round(pctSum(br)) !== 100) errs.push(`No bloco ${label}, as porcentagens precisam somar 100 %`);
    }
  }
  return [...new Set(errs)];
}

// ---------- gatilhos do bloco Início ----------

export type TriggerMatch = "contains" | "equals" | "starts";
export type TriggerSession = "always" | "not_in_flow" | "daily" | "once";
/** "Mensagem recebida": inicia o fluxo sozinho quando o contato escreve (sem palavras-chave = qualquer mensagem). */
export type MsgTrigger = { id: string; type: "message"; phone_number_id?: string; match?: TriggerMatch; keywords?: string[]; session?: TriggerSession; skip_team?: boolean };
export const MATCH_LABEL: Record<TriggerMatch, string> = { contains: "Contém", equals: "É igual a", starts: "Começa com" };
export const SESSION_LABEL: Record<TriggerSession, string> = {
  always: "Iniciar sempre",
  not_in_flow: "Só se o contato não estiver nesta automação",
  daily: "No máximo 1 vez a cada 24 horas por contato",
  once: "Só 1 vez por contato (nunca repete)",
};
export function triggersOf(startData: any): MsgTrigger[] {
  return Array.isArray(startData?.triggers) ? startData.triggers.filter((t: any) => t && t.type === "message") : [];
}
/** Texto comparável: sem acento, minúsculo, pontuação vira espaço. */
export function normKw(s: string) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
/** A mensagem bate com o gatilho? Palavra-chave casa como palavra inteira ("oi" não casa com "noite"). Sem palavras = qualquer mensagem. */
export function matchTrigger(t: MsgTrigger, text: string): { score: number; keyword: string | null } | null {
  const kws = (t.keywords || []).map((k) => String(k).trim()).filter(Boolean);
  if (!kws.length) return { score: 1, keyword: null };
  const msg = normKw(text);
  if (!msg) return null;
  let best: string | null = null, size = 0;
  for (const k of kws) {
    const kw = normKw(k);
    if (!kw) continue;
    const ok = t.match === "equals" ? msg === kw : t.match === "starts" ? `${msg} `.startsWith(`${kw} `) : ` ${msg} `.includes(` ${kw} `);
    if (ok && kw.length > size) { best = k; size = kw.length; }
  }
  return best ? { score: 1000 + size, keyword: best } : null; // palavra-chave ganha de "qualquer mensagem"; a mais longa ganha
}

// ---------- texto com variáveis ----------

export function fillText(text: string, c: { name?: string | null; phone: string; email?: string | null; fields?: Record<string, any> | null }, vars: Record<string, any> = {}) {
  return fillTokens(text, c, vars);
}

