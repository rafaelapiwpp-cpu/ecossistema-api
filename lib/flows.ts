// Fluxos (automações de disparo): grafo de blocos, execuções por contato e motor orientado a eventos.
import { query } from "./db";
import {
  findOrCreateContact, findOrCreateConversation, sendTemplate, sendText, sendMedia, sendInteractive, renderTemplatePreview, logEvent, sameMobileIds,
  brPhoneAlt, isOfficialContact,
  type Contact, type Conversation,
} from "./chat";
import { MetaError } from "./meta";
import { getSettings, type Settings } from "./settings";
import { metaErrorHint } from "./meta-errors";
import { buildComponents, placeholdersOf, type Mapping } from "./template-vars";
import { audienceSql, normalizePhone, type Audience } from "./campaigns";

export type { NodeType, FlowNode, FlowEdge, Graph, FlowStatus, Flow, RunStatus, FlowRun } from "./flow-shared";
export { FLOW_STATUS, RUN_STATUS, NODE_LABEL, portsOf, validateGraph, fillText, phoneSplitOf, groupOf } from "./flow-shared";
import { NODE_LABEL, fillText, phoneSplitOf, groupOf, splitBranchesOf, wrrAssign, pickBalanced, adaptMapping, type Flow, type FlowNode, type FlowRun, type Graph, type RunStatus, type GroupEntry } from "./flow-shared";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([130429, 131056, 80007, 131048, 4, 2]);
const MAX_STEPS = 60;

// ---------- horário comercial ----------

const SP_OFFSET_MIN = -180; // America/Sao_Paulo (sem horário de verão)
export function nextBusinessTime(from: Date, startHour = 8, endHour = 18) {
  const local = new Date(from.getTime() + SP_OFFSET_MIN * 60000); // "relógio" de São Paulo em UTC
  const day = local.getUTCDay(), hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  let target = new Date(local);
  if (day >= 1 && day <= 5 && hour >= startHour && hour < endHour) return from;
  if (day >= 1 && day <= 5 && hour < startHour) { target.setUTCHours(startHour, 0, 0, 0); }
  else {
    target.setUTCDate(target.getUTCDate() + 1); target.setUTCHours(startHour, 0, 0, 0);
    while (target.getUTCDay() === 0 || target.getUTCDay() === 6) target.setUTCDate(target.getUTCDate() + 1);
  }
  return new Date(target.getTime() - SP_OFFSET_MIN * 60000);
}

// ---------- início: público ----------

function parseAudience(a: any): Audience {
  const ids = (v: any) => (Array.isArray(v) ? v.map(Number).filter(Boolean) : []);
  const scope = ["lists", "tags", "all", "phones"].includes(a?.scope) ? a.scope : "lists";
  return {
    scope, list_ids: ids(a?.list_ids), tag_ids: ids(a?.tag_ids), department_id: a?.department_id ? Number(a.department_id) : null,
    waba_only: !!a?.waba_only, other_accounts: !!a?.other_accounts, exclude_tag_ids: ids(a?.exclude_tag_ids), exclude_recent_days: Math.max(0, Number(a?.exclude_recent_days || 0)),
    exclude_campaign_ids: ids(a?.exclude_campaign_ids), only_replied: !!a?.only_replied,
    phones: scope === "phones" ? String(a?.phones_text ?? (Array.isArray(a?.phones) ? a.phones.join("\n") : "")).split(/[\n\r,;]+/).map(normalizePhone).filter(Boolean) : [],
  };
}

const ACTIVE_RUN = "('queued', 'running', 'waiting_reply', 'waiting_time')";
const isActiveRun = (st: string) => ["queued", "running", "waiting_reply", "waiting_time"].includes(st);

export type EnqueueOpts = { retry?: boolean; resend?: boolean };
/** Resultado de pôr contatos na fila: quantos entraram e por que os outros ficaram de fora. */
export type EnqueueResult = { queued: number; fresh: number; retried: number; resent: number; active: number; done: number; failedSkipped: number; optout: number };
const emptyResult = (): EnqueueResult => ({ queued: 0, fresh: 0, retried: 0, resent: 0, active: 0, done: 0, failedSkipped: 0, optout: 0 });

/** Situação de cada contato neste fluxo (última execução real): nova, em andamento, concluída ou falhou/cancelada. */
async function classify(flow: Flow, contactIds: number[]) {
  const last = contactIds.length ? await query<{ contact_id: number; status: string }>(
    "select distinct on (contact_id) contact_id, status from flow_runs where flow_id = $1 and not is_test and contact_id = any($2::int[]) order by contact_id, id desc",
    [flow.id, contactIds],
  ) : [];
  return new Map(last.map((r) => [Number(r.contact_id), r.status]));
}

/**
 * Põe contatos na fila. Quem está no meio do fluxo não entra de novo; quem já concluiu só entra com "reenviar";
 * quem falhou ou foi cancelado entra de novo (padrão). Cada nova tentativa é uma execução nova — a anterior fica no histórico.
 * Testes nunca bloqueiam: um teste em andamento do mesmo contato é substituído pelo disparo.
 */
export async function enqueueContacts(flow: Flow, list: { id: number; phone: string }[], when: Date | null, opt: EnqueueOpts = {}) {
  const res = emptyResult();
  const uniq = [...new Map(list.map((c) => [c.id, c])).values()];
  const prev = await classify(flow, uniq.map((c) => c.id));
  const go: { id: number; phone: string }[] = [];
  for (const c of uniq) {
    const st = prev.get(c.id);
    if (!st) { go.push(c); res.fresh++; }
    else if (isActiveRun(st)) res.active++;
    else if (st === "done") { if (opt.resend) { go.push(c); res.resent++; } else res.done++; }
    else if (opt.retry !== false) { go.push(c); res.retried++; }
    else res.failedSkipped++;
  }
  const ids: number[] = [];
  if (go.length) {
    await query(
      `update flow_runs set status = 'cancelled', last_error = 'Substituído pelo disparo', finished_at = now(), updated_at = now()
       where flow_id = $1 and is_test and contact_id = any($2::int[]) and status in ${ACTIVE_RUN}`, [flow.id, go.map((c) => c.id)]);
    for (let i = 0; i < go.length; i += 1000) {
      const chunk = go.slice(i, i + 1000);
      const r = await query<{ id: number }>(
        `insert into flow_runs (flow_id, contact_id, phone, next_at) select $1, a.c, a.p, $4 from unnest($2::int[], $3::text[]) as a(c, p)
         on conflict (flow_id, contact_id) where not is_test and status in ${ACTIVE_RUN} do nothing returning id`,
        [flow.id, chunk.map((c) => c.id), chunk.map((c) => c.phone), when],
      );
      for (const x of r) ids.push(Number(x.id));
    }
    await assignPhones(flow, ids);
  }
  res.queued = ids.length;
  return res;
}

/** Contatos do público do bloco Início (números avulsos viram contatos; quem pediu para sair fica de fora). */
async function audienceContacts(flow: Flow, audience: any, create: boolean) {
  const a = parseAudience(audience);
  const out: { id: number; phone: string }[] = [];
  let optout = 0, unknown = 0;
  if (a.scope === "phones") {
    for (const phone of [...new Set(a.phones || [])]) {
      const c = create ? await findOrCreateContact(flow.waba_id, phone, null, "fluxo") : await findContact(flow.waba_id, phone);
      if (!c) { unknown++; continue; }
      if (c.opt_out) { optout++; continue; }
      out.push({ id: c.id, phone: c.phone });
    }
  } else {
    const { sql, params } = audienceSql(a, flow.waba_id);
    const rows = await query<{ contact_id: number; phone: string }>(`select contact_id, phone from (${sql}) x where contact_id is not null`, params);
    for (const r of rows) out.push({ id: Number(r.contact_id), phone: r.phone });
  }
  return { contacts: out, optout, unknown };
}

/** O contato que o envio usaria para este número, sem criar nada (mesma regra do 9º dígito de findOrCreateContact). */
async function findContact(wabaId: string, phone: string) {
  const alt = brPhoneAlt(phone);
  const rows = await query<Contact>("select * from contacts where waba_id = $1 and phone = any($2::text[])", [wabaId, alt ? [phone, alt] : [phone]]);
  const exact = rows.find((c) => c.phone === phone), other = rows.find((c) => c.phone === alt);
  if (exact && other) return isOfficialContact(other) && !isOfficialContact(exact) ? other : exact;
  return exact || other || null;
}

/** Cria as execuções (na fila) para o público do bloco Início. */
export async function enqueueAudience(flow: Flow, when: Date | null, opt: EnqueueOpts = {}) {
  const start = flow.graph.nodes.find((n) => n.type === "start");
  const { contacts, optout } = await audienceContacts(flow, start?.data?.audience, true);
  const res = await enqueueContacts(flow, contacts, when, opt);
  res.optout += optout;
  return res;
}

/** Prévia do Iniciar: quantos do público são novos, estão no meio do fluxo, já concluíram ou falharam antes. */
export async function audienceBreakdown(flow: Flow, audience: any) {
  const { contacts, optout, unknown } = await audienceContacts(flow, audience, false);
  const prev = await classify(flow, [...new Set(contacts.map((c) => c.id))]);
  const b = { fresh: unknown, active: 0, done: 0, failed: 0, optout };
  for (const id of new Set(contacts.map((c) => c.id))) {
    const st = prev.get(id);
    if (!st) b.fresh++; else if (isActiveRun(st)) b.active++; else if (st === "done") b.done++; else b.failed++;
  }
  return b;
}

// ---------- randomizador de números ----------

/** Dá a cada execução nova um número de envio, na proporção definida no bloco Início (o contato fica preso ao número até o fim). */
export async function assignPhones(flow: Flow, runIds: number[]) {
  if (!runIds.length) return;
  const start = flow.graph.nodes.find((n) => n.type === "start");
  const split = phoneSplitOf(start?.data, flow.phone_number_id);
  if (split.length === 1) { await query("update flow_runs set phone_number_id = $2 where id = any($1::bigint[])", [runIds, split[0].id]); return; }
  let chosen: string[];
  if (runIds.length >= 20) {
    chosen = wrrAssign(split, runIds.length); // lote grande: intercala na proporção exata
  } else {
    // poucos contatos: continua de onde a distribuição parou
    const rows = await query<{ phone_number_id: string; n: number }>("select phone_number_id, count(*)::int as n from flow_runs where flow_id = $1 and is_test = false and phone_number_id is not null group by 1", [flow.id]);
    const counts = new Map(rows.map((r) => [r.phone_number_id, r.n]));
    chosen = runIds.map(() => { const p = pickBalanced(split, (x) => counts.get(x.id) || 0)!; counts.set(p.id, (counts.get(p.id) || 0) + 1); return p.id; });
  }
  await query("update flow_runs r set phone_number_id = a.pn from unnest($1::bigint[], $2::text[]) as a(id, pn) where r.id = a.id", [runIds, chosen]);
}

/** Escolhe o template do grupo para esta execução, mantendo as porcentagens por número (contadores em flow_split_counts). */
async function pickTemplate(flow: Flow, nodeId: string, pnid: string, group: GroupEntry[], count: boolean) {
  let cand = group.filter((e) => !e.phone_number_id || e.phone_number_id === pnid);
  if (!cand.length) cand = group;
  const rows = await query<{ key: string; n: number }>("select key, n from flow_split_counts where flow_id = $1 and node_id = $2 and key like $3", [flow.id, nodeId, `${pnid}|%`]);
  const counts = new Map(rows.map((r) => [r.key, r.n]));
  const chosen = pickBalanced(cand, (e) => counts.get(`${pnid}|${e.template_id}`) || 0)!;
  if (count) await query("insert into flow_split_counts (flow_id, node_id, key, n) values ($1, $2, $3, 1) on conflict (flow_id, node_id, key) do update set n = flow_split_counts.n + 1, updated_at = now()", [flow.id, nodeId, `${pnid}|${chosen.template_id}`]);
  return chosen;
}

/** Randomizador: escolhe a ramificação mais "atrasada" em relação à porcentagem (contagem por bloco). */
async function pickBranch(flow: Flow, nodeId: string, d: any, count: boolean) {
  const branches = splitBranchesOf(d);
  if (!branches.length) throw new Error("Randomizador sem ramificações");
  const rows = await query<{ key: string; n: number }>("select key, n from flow_split_counts where flow_id = $1 and node_id = $2", [flow.id, nodeId]);
  const counts = new Map(rows.map((r) => [r.key, r.n]));
  const chosen = pickBalanced(branches, (b) => counts.get(b.id) || 0)!;
  if (count) await query("insert into flow_split_counts (flow_id, node_id, key, n) values ($1, $2, $3, 1) on conflict (flow_id, node_id, key) do update set n = flow_split_counts.n + 1, updated_at = now()", [flow.id, nodeId, chosen.id]);
  return chosen;
}

// ---------- motor ----------

type Ctx = { s: Settings; flow: Flow; run: FlowRun; contact: Contact; conv: Conversation };

async function event(ctx: Ctx, nodeId: string, type: string, data: any = null) {
  await query("insert into flow_events (flow_id, run_id, node_id, type, data) values ($1, $2, $3, $4, $5)", [ctx.flow.id, ctx.run.id, nodeId, type, data]);
}

async function setRun(ctx: Ctx, patch: Record<string, any>) {
  const keys = Object.keys(patch);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await query(`update flow_runs set ${sets}, updated_at = now() where id = $1`, [ctx.run.id, ...keys.map((k) => patch[k])]);
  Object.assign(ctx.run, patch);
}

async function finish(ctx: Ctx, status: RunStatus, error: string | null = null) {
  await setRun(ctx, { status, last_error: error, finished_at: new Date().toISOString(), wait_node_id: null, wait_until: null, next_at: null });
  if (status === "failed") await backToTeam(ctx.run);
}

/** Robô iniciado por mensagem (gatilho) que falhou antes de transferir: a conversa volta para Aguardando (a equipe atende). */
async function backToTeam(run: FlowRun) {
  if (run.vars?.trigger === "message" && !run.vars?.handoff && run.conversation_id) {
    await query("update conversations set status = 'open', unread_count = greatest(unread_count, 1) where id = $1 and status = 'disparo'", [run.conversation_id]);
  }
}

/** Motivo em português de uma falha de entrega da Meta (ex.: 131042 → pagamento). */
const failReason = (code: number | null | undefined, title: string | null | undefined) =>
  `${metaErrorHint(code) || title || "A Meta não entregou a mensagem"}${code ? ` (${code})` : ""}`;

/** Se a mensagem já voltou como não entregue, devolve o motivo. */
async function undeliveredReason(wamid: string | null | undefined) {
  if (!wamid) return null;
  const [m] = await query<{ status: string | null; error_code: number | null; error_title: string | null }>("select status, error_code, error_title from messages where wamid = $1", [wamid]);
  return m?.status === "failed" ? failReason(m.error_code, m.error_title) : null;
}

/**
 * A Meta avisou que uma mensagem enviada pelo fluxo não foi entregue (ex.: pagamento, número sem WhatsApp).
 * Fica registrado no bloco que enviou; se essa era a última mensagem da execução, ela segue pela saída
 * "Caso ocorrer erro no envio" (quando ligada) ou termina como falha com o motivo — em vez de "aguardar resposta" para sempre.
 */
export async function onFlowMessageFailed(runId: number, wamid: string, code: number | null, title: string | null) {
  const [run] = await query<FlowRun>("select * from flow_runs where id = $1", [runId]);
  const [flow] = run ? await query<Flow>("select * from flows where id = $1", [run.flow_id]) : [];
  if (!run || !flow) return;
  const seen = await query("select 1 from flow_events where run_id = $1 and type = 'undelivered' and data->>'wamid' = $2 limit 1", [runId, wamid]);
  if (seen.length) return;
  const [sent] = await query<{ node_id: string }>("select node_id from flow_events where run_id = $1 and type = 'sent' and data->>'wamid' = $2 order by id limit 1", [runId, wamid]);
  const node = flow.graph.nodes.find((n) => n.id === (sent?.node_id || run.node_id));
  const reason = failReason(code, title);
  if (node) await query("insert into flow_events (flow_id, run_id, node_id, type, data) values ($1, $2, $3, 'undelivered', $4)", [flow.id, runId, node.id, { wamid, code, title, message: reason }]);
  if (run.last_wamid !== wamid || !["waiting_reply", "waiting_time", "done"].includes(run.status)) return; // a execução já seguiu adiante
  const msg = `${node ? describeNode(node) : "Envio"}: não entregue — ${reason}`;
  const onError = node && flow.status === "active" ? edgeFrom(flow.graph, node.id, "error") : null;
  if (onError) {
    const [r] = await query<FlowRun>(
      "update flow_runs set status = 'running', node_id = $2, wait_node_id = null, wait_until = null, next_at = null, finished_at = null, last_error = $3, updated_at = now() where id = $1 and status = $4 returning *",
      [runId, node!.id, msg, run.status],
    );
    const s = r ? await getSettings() : null;
    if (r && s) { await advance(s, flow, r, "error"); return; }
  }
  await query(
    "update flow_runs set status = 'failed', last_error = $2, finished_at = now(), wait_node_id = null, wait_until = null, next_at = null, updated_at = now() where id = $1 and status in ('waiting_reply', 'waiting_time', 'done', 'running')",
    [runId, msg],
  );
  await backToTeam(run);
}

function edgeFrom(g: Graph, nodeId: string, port: string) {
  return g.edges.find((e) => e.from === nodeId && e.port === port) || null;
}

async function windowOpen(ctx: Ctx) {
  const [c] = await query<{ window_expires_at: string | null }>("select window_expires_at from conversations where id = $1", [ctx.conv.id]);
  return Boolean(c?.window_expires_at && new Date(c.window_expires_at).getTime() > Date.now());
}

async function evalCondition(ctx: Ctx, d: any): Promise<boolean> {
  const c = ctx.contact;
  const kind = String(d?.kind || "");
  if (kind === "tag") {
    // uma ou várias tags: verdadeiro se o contato tiver pelo menos uma delas
    const ids = (Array.isArray(d.tag_ids) && d.tag_ids.length ? d.tag_ids : [d.tag_id]).map(Number).filter((x: number) => Number.isInteger(x) && x > 0);
    const r = ids.length ? await query("select 1 from contact_tags where contact_id = $1 and tag_id = any($2::int[]) limit 1", [c.id, ids]) : [];
    return d.op === "not" ? r.length === 0 : r.length > 0;
  }
  if (kind === "list") {
    const r = await query("select 1 from list_contacts where contact_id = $1 and list_id = $2", [c.id, Number(d.list_id)]);
    return d.op === "not" ? r.length === 0 : r.length > 0;
  }
  if (kind === "optout") return Boolean(c.opt_out);
  if (kind === "replied") return ctx.run.vars.last_reply != null;
  const value = (() => {
    if (kind === "reply") return String(ctx.run.vars.last_reply ?? "");
    const f = String(d.field || "");
    if (f === "name") return c.name || ""; if (f === "email") return c.email || ""; if (f === "phone") return c.phone;
    return String(c.fields?.[f.startsWith("fields.") ? f.slice(7) : f] ?? "");
  })();
  const want = String(d.value ?? "").trim().toLowerCase();
  const have = value.trim().toLowerCase();
  switch (d.op) {
    case "empty": return !have;
    case "equals": return have === want;
    case "contains": return want ? have.includes(want) : false;
    case "filled": default: return Boolean(have);
  }
}

async function applyActions(ctx: Ctx, actions: any[]) {
  const c = ctx.contact;
  for (const a of actions || []) {
    switch (a.type) {
      case "add_tag": if (a.tag_id) await query("insert into contact_tags (contact_id, tag_id) values ($1, $2) on conflict do nothing", [c.id, Number(a.tag_id)]); break;
      case "remove_tag": if (a.tag_id) await query("delete from contact_tags where contact_id = $1 and tag_id = $2", [c.id, Number(a.tag_id)]); break;
      case "add_list": if (a.list_id) await query("insert into list_contacts (list_id, contact_id) values ($1, $2) on conflict do nothing", [Number(a.list_id), c.id]); break;
      case "remove_list": if (a.list_id) await query("delete from list_contacts where list_id = $1 and contact_id = $2", [Number(a.list_id), c.id]); break;
      case "set_department":
        await query("update contacts set department_id = $2, updated_at = now() where id = $1", [c.id, a.department_id ? Number(a.department_id) : null]);
        await query("update conversations set department_id = $2 where id = $1", [ctx.conv.id, a.department_id ? Number(a.department_id) : null]);
        break;
      case "assign_user": await query("update conversations set assigned_user_id = $2 where id = $1", [ctx.conv.id, a.user_id ? Number(a.user_id) : null]); break;
      case "set_field": if (a.field) { const v = fillText(String(a.value ?? ""), c, ctx.run.vars); await query("update contacts set fields = fields || jsonb_build_object($2::text, $3::text), updated_at = now() where id = $1", [c.id, String(a.field), v]); (c.fields ||= {})[String(a.field)] = v; } break;
      case "close_conversation": await query("update conversations set status = 'closed', closed_at = now() where id = $1", [ctx.conv.id]); await logEvent(ctx.conv.id, "closed", null, { by: "flow", flow_id: ctx.flow.id }); break;
      case "open_conversation": await query("update conversations set status = 'open', closed_at = null where id = $1", [ctx.conv.id]); break;
    }
  }
}

function describeNode(n: FlowNode) {
  return `${NODE_LABEL[n.type]}${n.data?.title ? ` · ${n.data.title}` : ""}`;
}

/** Executa a partir do bloco atual (ou do Início) até parar em uma espera, no fim ou em erro. */
export async function advance(s: Settings, flow: Flow, run: FlowRun, port: string | null) {
  const [contact] = await query<Contact>("select * from contacts where id = $1", [run.contact_id]);
  if (!contact) { await query("update flow_runs set status = 'failed', last_error = 'Contato não existe mais', finished_at = now(), updated_at = now() where id = $1", [run.id]); return; }
  const pnid = run.phone_number_id || flow.phone_number_id;
  const conv = await findOrCreateConversation(flow.waba_id, pnid, contact.id, "fluxo");
  const ctx: Ctx = { s, flow, run, contact, conv };
  const g = flow.graph;
  if (!run.phone_number_id) await setRun(ctx, { phone_number_id: pnid });
  if (!run.conversation_id) await setRun(ctx, { conversation_id: conv.id });
  if (!run.started_at) await setRun(ctx, { started_at: new Date().toISOString() });
  if (contact.opt_out && !run.is_test) { await finish(ctx, "stopped", "Contato pediu para não receber (opt-out)"); return; }

  let node: FlowNode | undefined;
  if (run.node_id && port) {
    // registra a saída mesmo sem ligação (ex.: respondeu numa opção que encerra): conta nos números do bloco
    await event(ctx, run.node_id, "branch", { port });
    const e = edgeFrom(g, run.node_id, port);
    if (!e) { await finish(ctx, "done"); return; }
    node = g.nodes.find((n) => n.id === e.to);
  } else {
    node = g.nodes.find((n) => n.type === "start");
  }

  const tplCache = new Map<string, { id: string; components: any[] | null; name: string; language: string; status: string | null; category: string | null }>();
  for (let step = 0; step < MAX_STEPS; step++) {
    if (!node) { await finish(ctx, "done"); return; }
    await setRun(ctx, { node_id: node.id, status: "running" });
    await event(ctx, node.id, "enter");
    const d = node.data || {};
    let next: string | null = "out";
    let attempt: Record<string, any> | null = null; // template/número tentados (para o evento de erro)
    try {
      switch (node.type) {
        case "start": break;
        case "end": await finish(ctx, "done"); return;
        case "template": {
          const group = groupOf(d);
          let tplId = String(d.template_id || "");
          if (group.length) tplId = (await pickTemplate(flow, node.id, pnid, group, !run.is_test)).template_id;
          let t = tplCache.get(tplId);
          if (!t) { [t] = await query<any>("select id, name, language, status, category, components from templates where id = $1", [tplId]); if (t) tplCache.set(tplId, t); }
          if (!t) throw new Error("Template do bloco não encontrado");
          attempt = { template_id: t.id, template_name: t.name, category: t.category, phone_number_id: pnid };
          const ph = placeholdersOf(t.components);
          const mapping = group.length ? adaptMapping((d.mapping || { body: [] }) as Mapping, ph) : ((d.mapping || { body: [] }) as Mapping);
          const built = buildComponents(ph, mapping, contact);
          if (built.missing.length) throw new Error(`Variável sem valor: ${built.missing.join(", ")}`);
          const preview = renderTemplatePreview(t.components, ph.body.map((k) => built.values[k] ?? ""));
          const msg = await sendWithRetry(() => sendTemplate(s, {
            phoneNumberId: pnid, to: contact.phone, conversationId: conv.id, contactId: contact.id, wabaId: flow.waba_id, userId: flow.created_by, flowRunId: run.id,
            template: { name: t!.name, language: t!.language, components: built.components, preview: ph.body.length ? preview : undefined },
          }));
          await setRun(ctx, { last_wamid: msg.wamid });
          await event(ctx, node.id, "sent", { ...attempt, wamid: msg.wamid });
          break;
        }
        case "message": {
          if (!(await windowOpen(ctx))) {
            if (edgeFrom(g, node.id, "closed")) { next = "closed"; break; }
            await finish(ctx, "stopped", "Janela de 24 h fechada: o contato precisa responder antes de receber mensagem livre");
            return;
          }
          const base = { phoneNumberId: pnid, to: contact.phone, conversationId: conv.id, contactId: contact.id, wabaId: flow.waba_id, userId: flow.created_by, flowRunId: run.id };
          const text = fillText(String(d.text || ""), contact, run.vars);
          let msg;
          if (d.kind === "buttons") {
            const buttons = (d.buttons || []).filter((b: any) => String(b.title || "").trim()).map((b: any, i: number) => ({ id: String(b.id || `b${i + 1}`), title: fillText(String(b.title), contact, run.vars) }));
            msg = await sendWithRetry(() => sendInteractive(s, { ...base, body: text, header: d.header || null, footer: d.footer || null, buttons }));
          } else if (d.kind === "list") {
            const rows = (d.rows || []).filter((r: any) => String(r.title || "").trim()).map((r: any, i: number) => ({ id: String(r.id || `r${i + 1}`), title: String(r.title), description: r.description || null }));
            msg = await sendWithRetry(() => sendInteractive(s, { ...base, body: text, header: d.header || null, footer: d.footer || null, list: { button: String(d.list_button || "Ver opções"), rows } }));
          } else if (d.media?.id && ["image", "video", "audio", "document"].includes(d.kind)) {
            msg = await sendWithRetry(() => sendMedia(s, { ...base, kind: d.kind, mediaId: String(d.media.id), mime: d.media.mime || null, caption: text || null, filename: d.media.filename || null }));
          } else {
            msg = await sendWithRetry(() => sendText(s, { ...base, body: text }));
          }
          await setRun(ctx, { last_wamid: msg.wamid });
          await event(ctx, node.id, "sent", { kind: d.kind || "text", wamid: msg.wamid, phone_number_id: pnid });
          break;
        }
        case "wait": {
          // a mensagem anterior já voltou como não entregue (ex.: pagamento): não adianta esperar resposta
          const why = await undeliveredReason(ctx.run.last_wamid);
          if (why) { await finish(ctx, "failed", `Mensagem anterior não entregue — ${why}`); return; }
          const timeout = Number(d.timeout || 0);
          await setRun(ctx, { status: "waiting_reply", wait_node_id: node.id, wait_until: timeout > 0 ? new Date(Date.now() + timeout * 60000).toISOString() : null, next_at: null });
          return;
        }
        case "condition": next = (await evalCondition(ctx, d)) ? "yes" : "no"; break;
        case "split": next = (await pickBranch(flow, node.id, d, !run.is_test)).id; break;
        case "action": await applyActions(ctx, d.actions || []); break;
        case "delay": {
          const amount = Math.max(0, Number(d.amount || 0));
          const mult = d.unit === "days" ? 86400000 : d.unit === "hours" ? 3600000 : 60000;
          let at = new Date(Date.now() + amount * mult);
          if (d.business_hours) at = nextBusinessTime(at);
          await setRun(ctx, { status: "waiting_time", next_at: at.toISOString(), wait_node_id: null, wait_until: null });
          return;
        }
        case "handoff": {
          await query(
            `update conversations set status = 'open', unread_count = greatest(unread_count, 1), department_id = coalesce($2, department_id), assigned_user_id = coalesce($3, assigned_user_id), closed_at = null,
               last_preview = case when $4 <> '' then $4 else last_preview end, last_message_at = coalesce(last_message_at, now()) where id = $1`,
            [conv.id, d.department_id ? Number(d.department_id) : null, d.user_id ? Number(d.user_id) : null, fillText(String(d.note || ""), contact, run.vars)],
          );
          await logEvent(conv.id, "handoff", null, { flow_id: flow.id, flow_name: flow.name, note: d.note ? fillText(String(d.note), contact, run.vars) : null });
          if (run.vars?.trigger === "message") await setRun(ctx, { vars: { ...run.vars, handoff: true } }); // daqui em diante a conversa é da equipe
          break;
        }
      }
    } catch (e: any) {
      const code = e instanceof MetaError ? e.code : undefined;
      await event(ctx, node.id, "error", { ...(attempt || {}), message: String(e.message || e).slice(0, 300), code: code ?? null });
      const fatal = code === 190 || code === 10 || code === 200; // token/permissão: pausa o fluxo inteiro
      // saída "Caso ocorrer erro no envio" ligada: o contato segue por ela em vez de parar
      const onError = !fatal && (node.type === "template" || node.type === "message") ? edgeFrom(g, node.id, "error") : null;
      if (onError) {
        await setRun(ctx, { last_error: `${describeNode(node)}: ${String(e.message || e).slice(0, 300)}` });
        await event(ctx, node.id, "branch", { port: "error" });
        node = g.nodes.find((n) => n.id === onError.to);
        continue;
      }
      await finish(ctx, "failed", `${describeNode(node)}: ${String(e.message || e).slice(0, 300)}`);
      if (fatal) await query("update flows set status = 'paused', last_error = $2, updated_at = now() where id = $1", [flow.id, `Pausado automaticamente: ${e.message}`]);
      return;
    }
    if (next) await event(ctx, node.id, "branch", { port: next });
    const e = next ? edgeFrom(g, node.id, next) : null;
    if (!e) { await finish(ctx, "done"); return; }
    node = g.nodes.find((n) => n.id === e.to);
  }
  await finish(ctx, "failed", "Fluxo em loop: passou de 60 blocos em uma execução");
}

async function sendWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e: any) {
      const code = e instanceof MetaError ? e.code : undefined;
      if (code && RETRYABLE.has(code) && attempt < 2) { await sleep(2000); continue; }
      throw e;
    }
  }
}

// ---------- entrada de mensagem (webhook) ----------

type Reply = { text: string; id: string | null; title: string | null; type: string };

function matchWait(node: FlowNode, r: Reply) {
  const norm = (v: any) => String(v ?? "").trim().toLowerCase();
  for (const o of (node.data?.options || []) as any[]) {
    const v = norm(o.value), id = String(o.id);
    if (o.match === "any") return id;
    if (o.match === "button") {
      if ((r.id && norm(r.id) === norm(o.button_id || o.value)) || (r.title && norm(r.title) === v) || (r.text && norm(r.text) === v)) return id;
    } else {
      // "contains" (padrão): o texto ou o título do botão contém o valor
      if (v && (norm(r.text).includes(v) || norm(r.title).includes(v))) return id;
    }
  }
  return "other";
}

/** Chamado quando chega mensagem do contato: avança a execução que estava esperando. */
export async function onFlowInbound(s: Settings, contactId: number, phoneNumberId: string, parsed: { type: string; body: string | null }, raw: any) {
  if (parsed.type === "reaction") return false;
  // a execução pode estar no mesmo celular salvo no outro formato (com/sem o 9)
  const ids = await sameMobileIds(contactId);
  // uma resposta avança uma execução só: a da mensagem respondida (botão/citação) ou, senão, a mais recente
  const [run] = await query<FlowRun>(
    `update flow_runs r set status = 'running', updated_at = now()
     where r.id = (select x.id from flow_runs x join flows f on f.id = x.flow_id
                   where x.contact_id = any($1::int[]) and coalesce(x.phone_number_id, f.phone_number_id) = $2 and x.status = 'waiting_reply' and f.status = 'active'
                   order by (x.last_wamid = $3) desc nulls last, x.updated_at desc limit 1 for update of x skip locked)
       and r.status = 'waiting_reply' returning r.*`,
    [ids, phoneNumberId, raw?.context?.id ?? null],
  );
  if (!run) return false;
  const [flow] = await query<Flow>("select * from flows where id = $1", [run.flow_id]);
  const node = flow?.graph.nodes.find((n) => n.id === run.wait_node_id);
  const reply: Reply = {
    text: parsed.body || "", type: parsed.type,
    id: raw?.interactive?.button_reply?.id ?? raw?.interactive?.list_reply?.id ?? raw?.button?.payload ?? null,
    title: raw?.interactive?.button_reply?.title ?? raw?.interactive?.list_reply?.title ?? raw?.button?.text ?? null,
  };
  const vars = { ...run.vars, last_reply: reply.title || reply.text, last_reply_id: reply.id, last_reply_type: reply.type, [`r_${run.wait_node_id}`]: reply.title || reply.text };
  await query("update flow_runs set vars = $2, node_id = $3, wait_node_id = null, wait_until = null where id = $1", [run.id, vars, run.wait_node_id]);
  run.vars = vars; run.node_id = run.wait_node_id; run.wait_node_id = null;
  // robô iniciado por mensagem (gatilho) e ainda não transferiu: a conversa continua na fila do robô
  if (vars.trigger === "message" && !vars.handoff && run.conversation_id) await query("update conversations set status = 'disparo' where id = $1 and status = 'open'", [run.conversation_id]);
  if (!flow || !node) { await query("update flow_runs set status = 'failed', last_error = 'Bloco de espera não existe mais', finished_at = now() where id = $1", [run.id]); return true; }
  const port = matchWait(node, reply);
  await advance(s, flow, run, port);
  return true;
}

/** Opt-out: encerra o que estiver em andamento para o contato. */
export async function stopRunsForContact(contactId: number, reason: string) {
  await query("update flow_runs set status = 'stopped', last_error = $2, finished_at = now(), updated_at = now() where contact_id = $1 and status in ('queued', 'running', 'waiting_reply', 'waiting_time')", [contactId, reason]);
}

// ---------- processamento em lote (fila e prazos) ----------

/** Processa a fila e os prazos de um fluxo por até `budgetMs`. */
export async function processFlow(s: Settings, id: number, budgetMs = 40000) {
  const started = Date.now();
  const [flow] = await query<Flow>(
    "update flows set lock_until = now() + interval '3 minutes', updated_at = now() where id = $1 and status = 'active' and (lock_until is null or lock_until < now()) returning *",
    [id],
  );
  if (!flow) return { ran: false, remaining: null as number | null };
  let processed = 0;
  const active = async () => (await query<{ status: string }>("select status from flows where id = $1", [id]))[0]?.status === "active";

  try {
    // execuções travadas (função interrompida no meio): não reenviamos para não duplicar mensagens
    await query("update flow_runs set status = 'failed', last_error = 'Execução interrompida no meio (tempo esgotado); reinicie o contato se quiser', finished_at = now(), updated_at = now() where flow_id = $1 and status = 'running' and updated_at < now() - interval '5 minutes'", [id]);

    // 1) prazos vencidos: esperas e timeouts de resposta
    const due = await query<FlowRun>(
      `update flow_runs set status = 'running', updated_at = now() where id in (
         select id from flow_runs where flow_id = $1 and ((status = 'waiting_time' and next_at <= now()) or (status = 'waiting_reply' and wait_until is not null and wait_until <= now()))
         order by coalesce(next_at, wait_until) limit 100)
       returning *, (case when wait_node_id is not null then 'timeout' else 'out' end) as resume_port`,
      [id],
    );
    for (const r of due as (FlowRun & { resume_port: string })[]) {
      if (Date.now() - started > budgetMs) break;
      if (r.resume_port === "timeout") { r.node_id = r.wait_node_id; await query("update flow_runs set node_id = wait_node_id, wait_node_id = null, wait_until = null where id = $1", [r.id]); }
      await advance(s, flow, r, r.resume_port);
      processed++;
    }

    // 2) fila de entrada (início por público), com velocidade
    const start = flow.graph.nodes.find((n) => n.type === "start");
    const rate = Math.max(10, Math.min(Number(start?.data?.rate_per_minute || 60), 600));
    const interval = 60000 / rate;
    const workers = Math.max(1, Math.min(4, Math.ceil(rate / 60)));
    let next = Date.now();
    let stop = false;
    while (!stop && Date.now() - started < budgetMs) {
      if (!(await active())) break;
      const batch = await query<FlowRun>(
        `update flow_runs set status = 'running', updated_at = now() where id in (
           select id from flow_runs where flow_id = $1 and status = 'queued' and (next_at is null or next_at <= now()) order by id limit $2) returning *`,
        [id, Math.min(40, Math.max(workers * 2, Math.ceil(rate / 6)))],
      );
      if (!batch.length) break;
      const inflight = new Set<Promise<void>>();
      for (let i = 0; i < batch.length; i++) {
        if (i > 0 && i % 3 === 0 && !(await active())) stop = true;
        if (Date.now() - started > budgetMs + 10000) stop = true;
        if (stop) { await query("update flow_runs set status = 'queued', updated_at = now() where id = any($1::bigint[]) and status = 'running'", [batch.slice(i).map((x) => x.id)]); break; }
        const wait = next - Date.now();
        if (wait > 0) await sleep(wait);
        next = Math.max(next, Date.now()) + interval;
        while (inflight.size >= workers) await Promise.race(inflight);
        const r = batch[i];
        const p: Promise<void> = advance(s, flow, r, null).catch(async (e) => { await query("update flow_runs set status = 'failed', last_error = $2, finished_at = now(), updated_at = now() where id = $1", [r.id, String(e?.message || e).slice(0, 300)]); }).then(() => { inflight.delete(p); processed++; });
        inflight.add(p);
      }
      await Promise.all(inflight);
      await query("update flows set lock_until = now() + interval '3 minutes', updated_at = now() where id = $1", [id]);
    }
  } finally {
    await query("update flows set lock_until = null, updated_at = now() where id = $1", [id]);
  }
  const [{ remaining }] = await query<{ remaining: number }>(
    `select count(*)::int as remaining from flow_runs where flow_id = $1 and ((status = 'queued' and (next_at is null or next_at <= now())) or (status = 'waiting_time' and next_at <= now()) or (status = 'waiting_reply' and wait_until is not null and wait_until <= now()))`, [id]);
  return { ran: true, processed, remaining };
}

/** Fluxos ativos com trabalho pronto para rodar e sem ninguém processando. */
export async function dueFlows() {
  return query<{ id: number }>(
    `select f.id from flows f where f.status = 'active' and (f.lock_until is null or f.lock_until < now())
       and exists (select 1 from flow_runs r where r.flow_id = f.id and ((r.status = 'queued' and (r.next_at is null or r.next_at <= now())) or (r.status = 'waiting_time' and r.next_at <= now()) or (r.status = 'waiting_reply' and r.wait_until is not null and r.wait_until <= now()) or (r.status = 'running' and r.updated_at < now() - interval '5 minutes')))
     order by f.id`,
  );
}

export function triggerFlowRun(s: Settings, baseUrl: string, id: number, waitMs = 5000) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/fluxos/${id}/run`;
  return fetch(url, { method: "POST", headers: { authorization: `Bearer ${s.cron_secret}` }, signal: AbortSignal.timeout(waitMs), cache: "no-store" }).then(() => true).catch(() => false);
}

export async function kickFlows(s: Settings, baseUrl: string) {
  const due = await dueFlows();
  await Promise.all(due.map((d) => triggerFlowRun(s, baseUrl, d.id)));
  return due.length;
}

// ---------- acompanhamento ----------

export async function flowStats(flowId: number) {
  // contagens e blocos incluem os testes (o teste mostra na hora o que aconteceu); a distribuição planejada × real, não
  const runs = await query<{ status: string; n: number; tests: number }>("select status, count(*)::int as n, count(*) filter (where is_test)::int as tests from flow_runs where flow_id = $1 group by status", [flowId]);
  const nodes = await query<{ node_id: string; entered: number; errors: number; undelivered: number; waiting: number }>(
    `select e.node_id, count(distinct e.run_id) filter (where e.type = 'enter')::int as entered, count(*) filter (where e.type = 'error')::int as errors,
            count(distinct e.run_id) filter (where e.type = 'undelivered')::int as undelivered,
            (select count(*)::int from flow_runs w where w.flow_id = $1 and w.node_id = e.node_id and w.status in ('waiting_reply', 'waiting_time')) as waiting
     from flow_events e join flow_runs r on r.id = e.run_id where e.flow_id = $1 group by e.node_id`, [flowId]);
  const branches = await query<{ node_id: string; port: string; n: number }>(
    `select e.node_id, e.data->>'port' as port, count(distinct e.run_id)::int as n
     from flow_events e join flow_runs r on r.id = e.run_id where e.flow_id = $1 and e.type = 'branch' group by 1, 2`, [flowId]);
  const counts: Record<string, number> = {};
  for (const r of runs) { counts[r.status] = r.n; counts.tests = (counts.tests || 0) + r.tests; }
  // distribuição por número de envio (execuções atribuídas + mensagens de template)
  const phones = await query<{ phone_number_id: string; runs: number; queued: number; done: number; failed: number; sent: number; delivered: number; read: number; undelivered: number }>(
    `select p.phone_number_id, p.runs, p.queued, p.done, p.failed, coalesce(m.sent, 0) as sent, coalesce(m.delivered, 0) as delivered, coalesce(m.read, 0) as read, coalesce(m.undelivered, 0) as undelivered
       from (select coalesce(r.phone_number_id, f.phone_number_id) as phone_number_id, count(*)::int as runs,
                    count(*) filter (where r.status = 'queued')::int as queued, count(*) filter (where r.status = 'done')::int as done,
                    count(*) filter (where r.status in ('failed', 'stopped'))::int as failed
               from flow_runs r join flows f on f.id = r.flow_id where r.flow_id = $1 and r.is_test = false group by 1) p
       left join (select m.phone_number_id, count(*)::int as sent, count(*) filter (where m.status in ('delivered', 'read'))::int as delivered,
                         count(*) filter (where m.status = 'read')::int as read, count(*) filter (where m.status = 'failed')::int as undelivered
                    from messages m join flow_runs r on r.id = m.flow_run_id where r.flow_id = $1 and r.is_test = false and m.direction = 'out' and m.type = 'template' group by 1) m
         on m.phone_number_id = p.phone_number_id
      order by p.phone_number_id`, [flowId]);
  // distribuição por template em cada bloco Enviar template (eventos "sent"/"error" + status da mensagem)
  const templates = await query<{ node_id: string; template_id: string; template_name: string; category: string | null; phone_number_id: string; sent: number; errors: number; delivered: number; read: number; undelivered: number }>(
    `select e.node_id, e.data->>'template_id' as template_id, e.data->>'template_name' as template_name, e.data->>'category' as category, e.data->>'phone_number_id' as phone_number_id,
            count(*) filter (where e.type = 'sent')::int as sent, count(*) filter (where e.type = 'error')::int as errors,
            count(*) filter (where e.type = 'sent' and m.status in ('delivered', 'read'))::int as delivered,
            count(*) filter (where e.type = 'sent' and m.status = 'read')::int as read,
            count(*) filter (where e.type = 'sent' and m.status = 'failed')::int as undelivered
       from flow_events e join flow_runs r on r.id = e.run_id
       left join messages m on e.type = 'sent' and m.wamid = e.data->>'wamid'
      where e.flow_id = $1 and r.is_test = false and e.type in ('sent', 'error') and e.data ? 'template_id'
      group by 1, 2, 3, 4, 5 order by 1, 3`, [flowId]);
  return { counts, nodes, branches, phones, templates };
}
