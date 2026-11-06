// Fluxos — metadados dos blocos, valores padrão, itens mostrados nos cartões, saídas e contadores. Sem acesso a banco.
import { groupOf, phoneSplitOf, splitBranchesOf, triggersOf, MATCH_LABEL, type MsgTrigger, type NodeType } from "@/lib/flow-shared";
import { placeholdersOf } from "@/lib/template-vars";
import { CATEGORY_LABEL } from "@/lib/format";

export type Catalog = {
  departments: { id: number; name: string; color?: string | null }[]; tags: { id: number; name: string; color: string | null }[];
  lists: { id: number; name: string; total?: number; waba_id?: string | null }[];
  phones: { id: string; waba_id: string; display_phone_number: string; verified_name: string | null; quality_rating?: string | null; messaging_limit?: string | null; label?: string | null }[];
  wabas: { id: string; name: string | null }[];
  templates: { id: string; waba_id: string; name: string; language: string; category: string | null; status?: string | null; components: any[] | null }[];
  users?: { id: number; name: string; role: string; department_id: number | null; active: boolean }[];
  me: { id: number; name?: string; role: string };
};
export type Options = { fields: { value: string; label: string }[]; users: { id: number; name: string; role: string; department_id: number | null }[]; campaigns: { id: number; name: string }[] };
export type Ctx = { catalog: Catalog; options: Options; templates: { id: string; name: string; language: string; category: string | null; status: string | null; components: any[] | null }[] };

/** Cada tipo de bloco: nome, descrição curta (como no cartão), ícone e cor do ícone. */
export const BLOCK: Record<NodeType, { label: string; desc: string; icon: string; color: string }> = {
  start: { label: "Início", desc: "O gatilho aciona a automação sozinho; o botão Iniciar dispara para um público. Clique para configurar:", icon: "play", color: "#34c759" },
  template: { label: "Template do WhatsApp", desc: "Abre a conversa com um template aprovado — pode ir fora da janela de 24 h:", icon: "whatsapp", color: "#25d366" },
  message: { label: "Mensagem", desc: "Envia texto, botões, lista ou mídia. Só com a janela de 24 h aberta:", icon: "bubble", color: "#007aff" },
  wait: { label: "Aguardar resposta", desc: "Espera o contato responder. Cada opção vira uma saída:", icon: "reply", color: "#5e5ce6" },
  condition: { label: "Condição", desc: "Faça filtros para seguir caminhos diferentes:", icon: "filter", color: "#32ade6" },
  action: { label: "Ações", desc: "Marca tags, move de lista, muda setor ou preenche campos:", icon: "bolt", color: "#ff9f0a" },
  delay: { label: "Espera", desc: "Espera um determinado tempo para continuar a execução:", icon: "clock", color: "#af52de" },
  split: { label: "Randomizador", desc: "Divida o fluxo em ramificações aleatórias:", icon: "shuffle", color: "#ff6b22" },
  handoff: { label: "Atendimento humano", desc: "Entrega a conversa para a equipe no Atendimento:", icon: "headset", color: "#ff375f" },
  end: { label: "Fim", desc: "Encerra a execução do contato neste ponto.", icon: "stop", color: "#8e8e93" },
};
/** Ordem do menu de blocos. */
export const PICKER: NodeType[] = ["template", "message", "wait", "condition", "action", "delay", "split", "handoff", "end"];

/** Cores das ramificações do Randomizador (azul, verde, laranja, roxo…), como no iOS. */
export const BRANCH_COLORS = ["#007aff", "#34c759", "#ff9500", "#af52de", "#ff2d55", "#30b0c7", "#ffcc00", "#5856d6"];

export const TIMEOUTS = [{ v: 0, l: "Sem limite" }, { v: 30, l: "30 minutos" }, { v: 60, l: "1 hora" }, { v: 180, l: "3 horas" }, { v: 360, l: "6 horas" }, { v: 720, l: "12 horas" }, { v: 1440, l: "24 horas" }, { v: 2880, l: "2 dias" }, { v: 4320, l: "3 dias" }, { v: 10080, l: "7 dias" }];

export function defaultData(type: NodeType): any {
  switch (type) {
    case "start": return { audience: { scope: "lists", list_ids: [], tag_ids: [], exclude_tag_ids: [], exclude_recent_days: 0, waba_only: false, phones_text: "" }, rate_per_minute: 60 };
    case "template": return { template_id: "", mode: "single", group: [], mapping: { header: null, body: [], buttons: [] } };
    case "message": return { kind: "text", text: "", buttons: [{ id: "b1", title: "" }], rows: [], list_button: "Ver opções", header: "", footer: "", media: null };
    case "wait": return { timeout: 1440, options: [] };
    case "condition": return { kind: "tag", op: "has", tag_id: "", tag_ids: [], list_id: "", field: "name", value: "" };
    case "action": return { actions: [{ type: "add_tag", tag_id: "" }] };
    case "delay": return { amount: 1, unit: "hours", business_hours: false };
    case "split": return { branches: [{ id: `r${Date.now().toString(36)}a`, label: "A", pct: 50 }, { id: `r${Date.now().toString(36)}b`, label: "B", pct: 50 }] };
    case "handoff": return { department_id: "", user_id: "", note: "" };
    case "end": return {};
  }
}

export function uid(prefix = "n") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const short = (t: string, n = 70) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
export const fmtCompact = (n: number) => {
  const v = Math.max(0, Math.round(n || 0));
  if (v < 1000) return String(v);
  if (v < 10000) return `${(Math.floor(v / 100) / 10).toString().replace(".", ",")}k`.replace(",0k", "k");
  if (v < 1_000_000) return `${Math.floor(v / 1000)}k`;
  return `${(Math.floor(v / 100000) / 10).toString().replace(".", ",")}M`;
};

export const MESSAGE_KINDS: { k: string; label: string; icon: string }[] = [
  { k: "text", label: "Mensagem de texto", icon: "text" }, { k: "buttons", label: "Texto com botões", icon: "buttons" }, { k: "list", label: "Lista de opções", icon: "list" },
  { k: "image", label: "Imagem", icon: "image" }, { k: "video", label: "Vídeo", icon: "video" }, { k: "document", label: "Documento", icon: "doc" }, { k: "audio", label: "Áudio", icon: "audio" },
];

export const ACTION_LABEL: Record<string, { label: string; icon: string }> = {
  add_tag: { label: "Adicionar tag", icon: "tag" }, remove_tag: { label: "Remover tag", icon: "tag" },
  add_list: { label: "Pôr na lista", icon: "plusList" }, remove_list: { label: "Tirar da lista", icon: "list" },
  set_department: { label: "Mudar setor", icon: "people" }, assign_user: { label: "Atribuir atendente", icon: "user" },
  set_field: { label: "Preencher campo", icon: "field" }, close_conversation: { label: "Encerrar conversa", icon: "check" }, open_conversation: { label: "Reabrir conversa", icon: "bubble" },
};

export type BlockItem = { icon: string; title: string; sub?: string; badge?: { text: string; cls: string } | null; mute?: boolean; key?: string };

/** Resumo de um gatilho "Mensagem recebida": palavras-chave e número que ouve. */
export function triggerSummary(t: MsgTrigger, c: Catalog | null | undefined) {
  const kws = (t.keywords || []).filter(Boolean);
  const words = kws.length ? `${MATCH_LABEL[t.match || "contains"]}: ${kws.join(", ")}` : "Qualquer mensagem";
  const p = t.phone_number_id ? c?.phones.find((x) => x.id === t.phone_number_id) : null;
  const phone = t.phone_number_id ? (p ? `…${p.display_phone_number.replace(/\D/g, "").slice(-4)}${p.label ? ` ${p.label}` : ""}` : "número removido") : "qualquer número";
  return `${words} · ${phone}`;
}
export const triggerBadge = (i: number) => `Mensagem-${i + 1}`;

/** Itens mostrados dentro do cartão do bloco (como os "subcartões" do construtor). */
export function blockItems(type: NodeType, d: any, ctx: Ctx | null): BlockItem[] {
  const c = ctx?.catalog;
  const tag = (id: any) => c?.tags.find((t) => t.id === Number(id))?.name || "tag removida";
  const list = (id: any) => c?.lists.find((t) => t.id === Number(id))?.name || "lista removida";
  const dept = (id: any) => c?.departments.find((t) => t.id === Number(id))?.name || "setor removido";
  const user = (id: any) => ctx?.options.users.find((u) => u.id === Number(id))?.name || "atendente removido";
  switch (type) {
    case "start": {
      const a = d?.audience || {};
      const n = String(a.phones_text || "").split(/[\n\r,;]+/).filter((x: string) => x.trim()).length;
      const who = a.scope === "all" ? "Todos os contatos da conta" : a.scope === "tags" ? `Tags: ${(a.tag_ids || []).map(tag).join(", ") || "nenhuma"}` : a.scope === "phones" ? `Números avulsos (${n})` : `Listas: ${(a.list_ids || []).map(list).join(", ") || "nenhuma"}`;
      const empty = a.scope !== "all" && !((a.list_ids || []).length || (a.tag_ids || []).length || n);
      const trig = triggersOf(d);
      const items: BlockItem[] = trig.map((t, i) => ({ icon: "bubble", title: "Mensagem recebida", sub: triggerSummary(t, c), badge: { text: triggerBadge(i), cls: "trig" }, key: t.id }));
      // com gatilho, o público do botão Iniciar só aparece se estiver preenchido
      if (!trig.length || !empty) items.push({ icon: a.scope === "phones" ? "phone" : a.scope === "tags" ? "tag" : "people", title: trig.length ? `Iniciar: ${who}` : who, sub: `Entrada de ${d?.rate_per_minute || 60} contatos por minuto`, mute: empty });
      const split = phoneSplitOf(d, "");
      if (Array.isArray(d?.phones) && d.phones.length > 1) {
        const num = (id: string) => { const p = c?.phones.find((x) => x.id === id); return p ? `…${p.display_phone_number.replace(/\D/g, "").slice(-4)}` : id; };
        items.push({ icon: "shuffle", title: `${split.length} números · randomizador`, sub: split.map((p) => `${num(p.id)} ${p.pct}%`).join(" · ") });
      }
      return items;
    }
    case "template": {
      const group = groupOf(d);
      if (group.length) {
        const names = group.map((e) => ctx?.templates.find((x) => x.id === e.template_id)?.name || e.template_id);
        return [{ icon: "shuffle", title: `${group.length} templates · randomizador`, sub: short(names.join(" · "), 60) }];
      }
      const t = ctx?.templates.find((x) => x.id === String(d?.template_id));
      if (!t) return [{ icon: "whatsapp", title: "Template do WhatsApp", sub: "Clique para escolher o template", mute: true }];
      const k = String(t.category || "");
      return [{ icon: "whatsapp", title: "Template do WhatsApp", sub: t.name, badge: k ? { text: CATEGORY_LABEL[k] || k, cls: `cat-${k.toLowerCase()}` } : null }];
    }
    case "message": {
      const kind = d?.kind || "text";
      const meta = MESSAGE_KINDS.find((m) => m.k === kind) || MESSAGE_KINDS[0];
      const text = String(d?.text || "");
      const sub = ["image", "video", "audio", "document"].includes(kind) ? (d?.media?.filename || "Envie o arquivo") + (text ? ` · ${text}` : "") : text || "Escreva a mensagem";
      return [{ icon: meta.icon, title: meta.label, sub: short(sub, 60), mute: !text && !d?.media?.id }];
    }
    case "wait": {
      const t = TIMEOUTS.find((x) => x.v === Number(d?.timeout || 0))?.l || `${d?.timeout} min`;
      return [{ icon: "clock", title: Number(d?.timeout) > 0 ? `Prazo de ${t}` : "Sem prazo para responder", sub: `${(d?.options || []).length} opção(ões) de resposta` }];
    }
    case "condition": {
      const k = d?.kind;
      if (k === "tag") {
        const ids = Array.isArray(d.tag_ids) && d.tag_ids.length ? d.tag_ids : d.tag_id ? [d.tag_id] : [];
        return [{ icon: "tag", title: d.op === "not" ? "Verifica se o lead NÃO possui a tag" : "Verifica se o lead possui uma tag", sub: ids.map(tag).join(", ") || "Escolha as tags", mute: !ids.length }];
      }
      if (k === "list") return [{ icon: "list", title: d.op === "not" ? "Verifica se o lead NÃO está na lista" : "Verifica se o lead está na lista", sub: d.list_id ? list(d.list_id) : "Escolha a lista", mute: !d.list_id }];
      if (k === "optout") return [{ icon: "alert", title: "Pediu para não receber", sub: "opt-out" }];
      if (k === "replied") return [{ icon: "reply", title: "Já respondeu neste fluxo" }];
      const what = k === "reply" ? "Última resposta" : `Campo "${d.field}"`;
      const op = d.op === "empty" ? "está vazio" : d.op === "equals" ? `é igual a "${d.value}"` : d.op === "contains" ? `contém "${d.value}"` : "está preenchido";
      return [{ icon: k === "reply" ? "reply" : "field", title: what, sub: op }];
    }
    case "action": return (d?.actions || []).map((a: any) => {
      const m = ACTION_LABEL[a.type] || { label: a.type, icon: "bolt" };
      const sub =
        a.type === "add_tag" || a.type === "remove_tag" ? (a.tag_id ? tag(a.tag_id) : "Escolha a tag")
        : a.type === "add_list" || a.type === "remove_list" ? (a.list_id ? list(a.list_id) : "Escolha a lista")
        : a.type === "set_department" ? (a.department_id ? dept(a.department_id) : "Nenhum setor")
        : a.type === "assign_user" ? (a.user_id ? user(a.user_id) : "Ninguém")
        : a.type === "set_field" ? `${a.field || "campo"} → ${short(String(a.value || ""), 30) || "vazio"}`
        : "";
      return { icon: m.icon, title: m.label, sub };
    });
    case "delay": {
      const unit = d?.unit === "days" ? (Number(d?.amount) === 1 ? "dia" : "dias") : d?.unit === "minutes" ? (Number(d?.amount) === 1 ? "minuto" : "minutos") : (Number(d?.amount) === 1 ? "hora" : "horas");
      return [{ icon: "clock", title: `Espera de ${d?.amount || 0} ${unit}`, sub: d?.business_hours ? "Continua só em horário comercial" : "Continua a qualquer hora" }];
    }
    case "handoff": return [{ icon: "headset", title: d?.department_id ? `Setor: ${dept(d.department_id)}` : "Qualquer setor", sub: d?.user_id ? `Atendente: ${user(d.user_id)}` : "Sem atendente fixo" }];
    case "split": return [];
    case "end": return [];
  }
}

/** Tom (cor) de cada saída: próximo passo (azul), opção/verdadeiro (ciano), erro (vermelho), alerta (laranja)… */
export function portTone(type: NodeType, port: string, index: number): string {
  if (type === "split") return `b${index % BRANCH_COLORS.length}`;
  if (port === "out") return "next";
  if (port === "error" || port === "no") return "error";
  if (port === "closed" || port === "timeout") return "warn";
  if (port === "other") return "muted";
  return "option";
}

/** Botão "+ Adicionar…" mostrado dentro do cartão. */
export const ADD_LABEL: Partial<Record<NodeType, string>> = { start: "Adicionar gatilho", action: "Adicionar ação", wait: "Adicionar opção", split: "Adicionar ramificação" };

/** Categorias dos templates de um bloco Template (para o selo). */
export function templateCategories(d: any, ctx: Ctx | null): { key: string; label: string; count: number }[] {
  const ids = groupOf(d).length ? groupOf(d).map((e) => e.template_id) : d?.template_id ? [String(d.template_id)] : [];
  const counts = new Map<string, number>();
  for (const id of ids) { const t = ctx?.templates.find((x) => x.id === id); const k = String(t?.category || "?"); counts.set(k, (counts.get(k) || 0) + 1); }
  return [...counts.entries()].map(([key, count]) => ({ key, label: CATEGORY_LABEL[key] || key, count }));
}

/** Botões de resposta rápida de um template (para preencher as opções do Aguardar resposta). */
export function templateButtons(components: any[] | null | undefined) {
  const buttons = ((components || []).find((c: any) => c?.type === "BUTTONS")?.buttons || []) as any[];
  return buttons.filter((b) => b.type === "QUICK_REPLY").map((b) => String(b.text || ""));
}

export { placeholdersOf, splitBranchesOf };
