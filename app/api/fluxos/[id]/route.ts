// Um fluxo: leitura, edição, ativação, início para o público, teste e execuções.
import { NextResponse, after } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { canSee, getScope } from "@/lib/access";
import { isManagerRole } from "@/lib/roles";
import { findOrCreateContact, sameMobileIds } from "@/lib/chat";
import { normalizePhone, selfUrl, audiencePreview } from "@/lib/campaigns";
import { advance, audienceBreakdown, enqueueAudience, enqueueContacts, flowStats, triggerFlowRun, validateGraph, type Flow, type Graph, type NodeType } from "@/lib/flows";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NODE_TYPES: NodeType[] = ["start", "template", "message", "wait", "condition", "action", "delay", "handoff", "split", "end"];

async function load(id: number, user: { role: string }) {
  const [f] = await query<Flow & { display_phone_number: string | null; phone_name: string | null; waba_name: string | null }>(
    `select f.*, pn.display_phone_number, pn.verified_name as phone_name, w.name as waba_name from flows f
     left join phone_numbers pn on pn.id = f.phone_number_id left join wabas w on w.id = f.waba_id where f.id = $1`, [id]);
  return f && canSee(await getScope(user), f.waba_id) ? f : null; // fluxo de BM que o usuário não vê = não existe
}

function cleanGraph(g: any): Graph {
  const nodes = (Array.isArray(g?.nodes) ? g.nodes : []).filter((n: any) => n && typeof n.id === "string" && NODE_TYPES.includes(n.type))
    .map((n: any) => ({ id: n.id.slice(0, 40), type: n.type as NodeType, x: Number(n.x) || 0, y: Number(n.y) || 0, data: n.data && typeof n.data === "object" ? n.data : {} }));
  const ids = new Set(nodes.map((n: any) => n.id));
  const edges = (Array.isArray(g?.edges) ? g.edges : []).filter((e: any) => e && ids.has(e.from) && ids.has(e.to) && typeof e.port === "string")
    .map((e: any) => ({ id: String(e.id || `${e.from}:${e.port}>${e.to}`).slice(0, 120), from: e.from, port: e.port.slice(0, 60), to: e.to }));
  // uma ligação por porta de saída
  const seen = new Set<string>();
  const uniq = edges.filter((e: any) => { const k = `${e.from}|${e.port}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { nodes, edges: uniq };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const id = Number((await params).id);
  const f = await load(id, r.user);
  if (!f) return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });
  const p = new URL(req.url).searchParams;
  if (p.get("run")) {
    // linha do tempo de uma execução: blocos por onde passou, mensagens enviadas (com entrega/leitura/falha) e respostas
    const [run] = await query<any>("select * from flow_runs where id = $1 and flow_id = $2", [Number(p.get("run")), id]);
    if (!run) return NextResponse.json({ error: "Execução não encontrada" }, { status: 404 });
    const [events, messages] = await Promise.all([
      query("select node_id, type, data, created_at from flow_events where run_id = $1 order by id limit 300", [run.id]),
      query(
        `select id, direction, type, body, template_name, status, error_code, error_title, ts from messages
         where flow_run_id = $1 or (conversation_id = $2 and direction = 'in' and ts >= $3 and ($4::timestamptz is null or ts <= $4 + interval '1 minute'))
         order by ts, id limit 100`,
        [run.id, run.conversation_id, run.started_at || run.created_at, run.finished_at],
      ),
    ]);
    return NextResponse.json({ run, events, messages });
  }
  const stats = await flowStats(id);
  let runs: any[] = [];
  let runsTotal = 0;
  if (p.get("runs")) {
    const where: string[] = ["r.flow_id = $1"]; const args: any[] = [id];
    if (p.get("rstatus")) { args.push(p.get("rstatus")); where.push(`r.status = $${args.length}`); }
    if (p.get("q")) { args.push(`%${p.get("q")}%`); where.push(`(c.name ilike $${args.length} or r.phone like $${args.length})`); }
    const page = Math.max(1, Number(p.get("page") || 1));
    const [{ n }] = await query<{ n: number }>(`select count(*)::int as n from flow_runs r join contacts c on c.id = r.contact_id where ${where.join(" and ")}`, args);
    runsTotal = n;
    runs = await query(
      `select r.id, r.contact_id, r.phone, r.status, r.node_id, r.vars, r.next_at, r.wait_until, r.last_error, r.is_test, r.started_at, r.finished_at, r.updated_at, r.conversation_id, c.name as contact_name,
              m.status as msg_status, m.error_code as msg_error_code, m.error_title as msg_error_title, m.type as msg_type, m.template_name as msg_template, m.ts as msg_ts
       from flow_runs r join contacts c on c.id = r.contact_id
       left join lateral (select status, error_code, error_title, type, template_name, ts from messages where wamid = r.last_wamid limit 1) m on r.last_wamid is not null
       where ${where.join(" and ")} order by r.updated_at desc limit 100 offset ${(page - 1) * 100}`, args);
  }
  const [templates, phones] = await Promise.all([
    query("select id, name, language, category, status, components from templates where waba_id = $1 and category <> 'AUTHENTICATION' order by name", [f.waba_id]),
    query<{ id: string }>("select id from phone_numbers where waba_id = $1", [f.waba_id]),
  ]);
  return NextResponse.json({ flow: f, stats, runs, runsTotal, templates, problems: validateGraph(f.graph, templates as any, phones) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const { s, user } = r;
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Apenas administradores e gestores alteram fluxos" }, { status: 403 });
  const id = Number((await params).id);
  const f = await load(id, user);
  if (!f) return NextResponse.json({ error: "Fluxo não encontrado" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const templates = await query<any>("select id, name, language, category, status, components from templates where waba_id = $1", [f.waba_id]);
  const phones = await query<{ id: string }>("select id from phone_numbers where waba_id = $1", [f.waba_id]);

  try {
    if (b.action === "save") {
      const graph = cleanGraph(b.graph);
      const name = String(b.name ?? f.name).trim() || f.name;
      await query("update flows set graph = $2, name = $3, settings = $4, updated_at = now() where id = $1", [id, graph, name, b.settings && typeof b.settings === "object" ? b.settings : f.settings]);
      return NextResponse.json({ ok: true, problems: validateGraph(graph, templates, phones) });
    }
    if (b.action === "duplicate") {
      const [row] = await query<{ id: number }>(
        "insert into flows (name, waba_id, phone_number_id, graph, settings, created_by) values ($1, $2, $3, $4, $5, $6) returning id",
        [`${f.name} (cópia)`.slice(0, 120), f.waba_id, f.phone_number_id, f.graph, f.settings || {}, user.id],
      );
      return NextResponse.json({ ok: true, id: row.id });
    }
    if (b.action === "rename") {
      await query("update flows set name = $2, updated_at = now() where id = $1", [id, String(b.name || "").trim() || f.name]);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "activate") {
      const problems = validateGraph(f.graph, templates, phones);
      if (problems.length) return NextResponse.json({ error: "Corrija o fluxo antes de ativar", problems }, { status: 400 });
      await query("update flows set status = 'active', last_error = null, updated_at = now() where id = $1", [id]);
      const base = selfUrl(req); after(() => triggerFlowRun(s, base, id));
      return NextResponse.json({ ok: true });
    }
    if (b.action === "pause") {
      await query("update flows set status = 'paused', updated_at = now() where id = $1", [id]);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "archive") {
      await query("update flows set status = 'archived', updated_at = now() where id = $1", [id]);
      await query("update flow_runs set status = 'cancelled', finished_at = now(), updated_at = now() where flow_id = $1 and status in ('queued', 'running', 'waiting_reply', 'waiting_time')", [id]);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "delete") {
      if (f.status === "active") return NextResponse.json({ error: "Pause o fluxo antes de excluir" }, { status: 400 });
      await query("delete from flow_events where flow_id = $1", [id]);
      await query("delete from flow_runs where flow_id = $1", [id]);
      await query("delete from flows where id = $1", [id]);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "preview") {
      const start = f.graph.nodes.find((n) => n.type === "start");
      const a = b.audience ?? start?.data?.audience;
      const audience = {
        scope: ["lists", "tags", "all", "phones"].includes(a?.scope) ? a.scope : "lists",
        list_ids: (a?.list_ids || []).map(Number), tag_ids: (a?.tag_ids || []).map(Number), department_id: a?.department_id ? Number(a.department_id) : null,
        waba_only: !!a?.waba_only, other_accounts: !!a?.other_accounts, exclude_tag_ids: (a?.exclude_tag_ids || []).map(Number), exclude_recent_days: Number(a?.exclude_recent_days || 0),
        exclude_campaign_ids: (a?.exclude_campaign_ids || []).map(Number), only_replied: !!a?.only_replied,
        phones: String(a?.phones_text || "").split(/[\n\r,;]+/).map(normalizePhone).filter(Boolean),
      } as any;
      const prev = await audiencePreview(audience, f.waba_id);
      // a janela do Iniciar mostra quem é novo, quem está no meio do fluxo, quem já concluiu e quem falhou antes
      return NextResponse.json(b.breakdown ? { ...prev, breakdown: await audienceBreakdown(f, a) } : prev);
    }
    if (b.action === "start") {
      // põe o público do bloco Início na fila (agora ou numa data) e ativa o fluxo
      const problems = validateGraph(f.graph, templates, phones);
      if (problems.length) return NextResponse.json({ error: "Corrija o fluxo antes de iniciar", problems }, { status: 400 });
      const when = b.scheduled_at ? new Date(b.scheduled_at) : null;
      if (when && isNaN(when.getTime())) return NextResponse.json({ error: "Data inválida" }, { status: 400 });
      const result = await enqueueAudience(f, when && when.getTime() > Date.now() ? when : null, { retry: b.retry_failed !== false, resend: !!b.resend_done });
      await query("update flows set status = 'active', last_error = null, updated_at = now() where id = $1", [id]);
      const base = selfUrl(req); after(() => triggerFlowRun(s, base, id));
      return NextResponse.json({ ok: true, created: result.queued, result });
    }
    if (b.action === "test") {
      const phone = normalizePhone(String(b.phone || ""));
      if (!phone) return NextResponse.json({ error: "Informe um telefone válido para o teste" }, { status: 400 });
      const problems = validateGraph(f.graph, templates, phones);
      if (problems.length) return NextResponse.json({ error: "Corrija o fluxo antes de testar", problems }, { status: 400 });
      const contact = await findOrCreateContact(f.waba_id, phone, null, "teste");
      // o teste anterior deste número (se ainda estiver andando) é substituído; o histórico fica no acompanhamento
      await query(
        `update flow_runs set status = 'cancelled', last_error = 'Substituído por um teste mais novo', finished_at = now(), updated_at = now()
         where flow_id = $1 and is_test and contact_id = any($2::int[]) and status in ('queued', 'running', 'waiting_reply', 'waiting_time')`,
        [id, await sameMobileIds(contact.id)],
      );
      const [run] = await query<any>("insert into flow_runs (flow_id, contact_id, phone, status, is_test, phone_number_id) values ($1, $2, $3, 'running', true, $4) returning *", [id, contact.id, contact.phone, f.phone_number_id]);
      // o teste roda mesmo com o fluxo em rascunho; respostas só avançam se o fluxo estiver ativo
      await advance(s, f, run, null);
      const [after_] = await query<any>("select status, node_id, last_error from flow_runs where id = $1", [run.id]);
      return NextResponse.json({ ok: true, run: after_ });
    }
    if (b.action === "cancel_runs") {
      const ids = Array.isArray(b.run_ids) ? b.run_ids.map(Number).filter(Boolean) : null;
      const res = ids
        ? await query("update flow_runs set status = 'cancelled', finished_at = now(), updated_at = now() where flow_id = $1 and id = any($2::bigint[]) and status in ('queued', 'running', 'waiting_reply', 'waiting_time') returning id", [id, ids])
        : await query("update flow_runs set status = 'cancelled', finished_at = now(), updated_at = now() where flow_id = $1 and status in ('queued', 'waiting_reply', 'waiting_time') returning id", [id]);
      return NextResponse.json({ ok: true, cancelled: res.length });
    }
    if (b.action === "restart_run") {
      const runId = Number(b.run_id);
      const [run] = await query<any>("select * from flow_runs where id = $1 and flow_id = $2", [runId, id]);
      if (!run) return NextResponse.json({ error: "Execução não encontrada" }, { status: 404 });
      if (["queued", "running", "waiting_reply", "waiting_time"].includes(run.status)) return NextResponse.json({ error: "Esta execução ainda está em andamento" }, { status: 400 });
      // recomeça como uma execução nova (a anterior fica no histórico, com o que aconteceu nela)
      if (run.is_test) { // teste: roda de novo na hora, como o "Testar"
        await query("update flow_runs set status = 'cancelled', finished_at = now(), updated_at = now() where flow_id = $1 and is_test and contact_id = any($2::int[]) and status in ('queued', 'running', 'waiting_reply', 'waiting_time')", [id, await sameMobileIds(run.contact_id)]);
        const [nr] = await query<any>("insert into flow_runs (flow_id, contact_id, phone, status, is_test, phone_number_id) values ($1, $2, $3, 'running', true, $4) returning *", [id, run.contact_id, run.phone, f.phone_number_id]);
        await advance(s, f, nr, null);
        return NextResponse.json({ ok: true });
      } else {
        const r = await enqueueContacts(f, [{ id: run.contact_id, phone: run.phone }], null, { retry: true, resend: true });
        if (!r.queued) return NextResponse.json({ error: "Este contato já está no meio do fluxo em outra execução" }, { status: 400 });
      }
      if (f.status === "active") { const base = selfUrl(req); after(() => triggerFlowRun(s, base, id)); }
      return NextResponse.json({ ok: true });
    }
    if (b.action === "add_contacts") {
      // adiciona números avulsos à fila (sem passar pelo público do Início)
      const list = String(b.phones || "").split(/[\n\r,;]+/).map(normalizePhone).filter(Boolean);
      const contacts: { id: number; phone: string }[] = [];
      let optout = 0;
      for (const phone of [...new Set(list)]) {
        const c = await findOrCreateContact(f.waba_id, phone, null, "fluxo");
        if (c.opt_out) { optout++; continue; }
        contacts.push({ id: c.id, phone: c.phone });
      }
      const result = await enqueueContacts(f, contacts, null, { retry: true, resend: !!b.resend_done });
      result.optout += optout;
      if (f.status === "active") { const base = selfUrl(req); after(() => triggerFlowRun(s, base, id)); }
      return NextResponse.json({ ok: true, created: result.queued, result, inactive: f.status !== "active" });
    }
    return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falhou", details: e.details }, { status: 400 });
  }
}
