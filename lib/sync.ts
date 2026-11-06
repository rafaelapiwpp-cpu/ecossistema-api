// Coleta os dados da Meta e grava no banco.
import { Graph, onlyDigits, bucketDay, MetaError } from "./meta";
import { query, upsert } from "./db";
import type { Settings } from "./settings";
import { autoCloseStale } from "./chat";
import { forgetConnectionCache, graphForWaba, listConnections, type Connection } from "./connections";

/** Linha do relatório da sincronização (conn = conexão/BM a que se refere, para filtrar por visibilidade). */
export type LogLine = { step: string; ok: boolean; info?: string; conn?: number };

const DAY = 86400;

function ranges(days: number, chunk = 90) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - days * DAY;
  const out: [number, number][] = [];
  for (let s = start; s < end; s += chunk * DAY) out.push([s, Math.min(s + chunk * DAY, end)]);
  return out;
}

const WABA_FIELDS = "id,name,currency,timezone_id,is_enabled_for_insights";

export async function listWabas(g: Graph, s: Pick<Connection, "waba_ids" | "business_id">, log: LogLine[]) {
  const fixed = (s.waba_ids || "").split(",").map((x) => x.trim()).filter(Boolean);
  const out: any[] = [];
  if (fixed.length) {
    for (const id of fixed) {
      try { out.push({ ...(await g.get(id, { fields: WABA_FIELDS })), ownership: "owned" }); }
      catch (e: any) { log.push({ step: `conta ${id}`, ok: false, info: e.message }); }
    }
    return out;
  }
  if (!s.business_id) throw new MetaError("Informe o ID do portfólio (BM) da conexão");
  for (const [edge, ownership] of [["owned_whatsapp_business_accounts", "owned"], ["client_whatsapp_business_accounts", "client"]] as const) {
    const label = ownership === "owned" ? "contas da BM" : "contas de clientes";
    try {
      const rows = await g.all(`${s.business_id}/${edge}`, { fields: WABA_FIELDS });
      out.push(...rows.map((r: any) => ({ ...r, ownership })));
      log.push({ step: label, ok: true, info: `${rows.length} conta(s)` });
    } catch (e: any) {
      log.push({ step: label, ok: false, info: e.message });
    }
  }
  const seen = new Set<string>();
  return out.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
}

async function syncPhones(g: Graph, wabaId: string) {
  const base = "id,display_phone_number,verified_name,quality_rating,status,name_status";
  let rows: any[];
  try { rows = await g.all(`${wabaId}/phone_numbers`, { fields: `${base},whatsapp_business_manager_messaging_limit` }); }
  catch { rows = await g.all(`${wabaId}/phone_numbers`, { fields: base }); }
  const mapped = rows.map((p) => ({
    id: String(p.id),
    waba_id: wabaId,
    display_phone_number: p.display_phone_number ?? null,
    phone_digits: onlyDigits(p.display_phone_number),
    verified_name: p.verified_name ?? null,
    quality_rating: p.quality_rating ?? null,
    messaging_limit: p.whatsapp_business_manager_messaging_limit ?? null,
    status: p.status ?? null,
    name_status: p.name_status ?? null,
    updated_at: new Date().toISOString(),
  }));
  await upsert("phone_numbers", mapped, ["id"]);
  return mapped;
}

/** Atualiza só os templates de uma conta. */
export async function syncWabaTemplates(s: Settings, wabaId: string) {
  return syncTemplates(await graphForWaba(s, wabaId), wabaId);
}

async function syncTemplates(g: Graph, wabaId: string) {
  const rows = await g.all(`${wabaId}/message_templates`, { fields: "id,name,language,category,status,quality_score,rejected_reason,components" });
  const mapped = rows.map((t: any) => ({
    id: String(t.id),
    waba_id: wabaId,
    name: t.name,
    language: t.language ?? null,
    category: t.category ?? null,
    status: t.status ?? null,
    quality_score: t.quality_score?.score ?? null,
    rejected_reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
    components: t.components ?? null,
    updated_at: new Date().toISOString(),
  }));
  await upsert("templates", mapped, ["id"]);
  // templates apagados na Meta (ou criados há pouco e já removidos) saem da lista; os criados pelo HUB nos últimos minutos ficam
  if (mapped.length) await query("delete from templates where waba_id = $1 and id <> all($2::text[]) and updated_at < now() - interval '10 minutes'", [wabaId, mapped.map((m) => m.id)]);
  return mapped;
}

async function syncMessages(g: Graph, wabaId: string, phones: { phone_digits: string }[], days: number) {
  const agg = new Map<string, any>();
  for (const p of phones) {
    if (!p.phone_digits) continue;
    for (const [s, e] of ranges(days)) {
      const field = `analytics.start(${s}).end(${e}).granularity(DAY).phone_numbers(["${p.phone_digits}"])`;
      const res: any = await g.get(wabaId, { fields: field });
      for (const dp of res?.analytics?.data_points || []) {
        const day = bucketDay(dp.start, dp.end);
        const key = `${p.phone_digits}|${day}`;
        const cur = agg.get(key) || { waba_id: wabaId, phone_digits: p.phone_digits, day, sent: 0, delivered: 0 };
        cur.sent += dp.sent || 0;
        cur.delivered += dp.delivered || 0;
        agg.set(key, cur);
      }
    }
  }
  await upsert("daily_messages", [...agg.values()], ["waba_id", "phone_digits", "day"]);
  return agg.size;
}

async function syncCosts(g: Graph, wabaId: string, days: number) {
  const agg = new Map<string, any>();
  for (const [s, e] of ranges(days)) {
    const field =
      `pricing_analytics.start(${s}).end(${e}).granularity(DAILY)` +
      `.metric_types(["COST","VOLUME"]).dimensions(["PRICING_CATEGORY","PRICING_TYPE","COUNTRY"])`;
    const res: any = await g.get(wabaId, { fields: field });
    for (const b of res?.pricing_analytics?.data || []) {
      for (const dp of b.data_points || []) {
        const day = bucketDay(dp.start, dp.end);
        const cat = dp.pricing_category || "UNKNOWN";
        const typ = dp.pricing_type || "UNKNOWN";
        const ctry = dp.country || "--";
        const key = `${day}|${cat}|${typ}|${ctry}`;
        const cur = agg.get(key) || { waba_id: wabaId, day, pricing_category: cat, pricing_type: typ, country: ctry, volume: 0, cost: 0 };
        cur.volume += dp.volume || 0;
        cur.cost += Number(dp.cost || 0);
        agg.set(key, cur);
      }
    }
  }
  await upsert("daily_costs", [...agg.values()], ["waba_id", "day", "pricing_category", "pricing_type", "country"]);
  return agg.size;
}

async function syncTemplateAnalytics(g: Graph, wabaId: string, templates: { id: string; status: string | null }[], days: number) {
  const ids = templates.filter((t) => t.status === "APPROVED").map((t) => t.id);
  if (!ids.length) return "0 linha(s)";
  const d = Math.min(days, 89);
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - d * DAY * 1000).toISOString().slice(0, 10);
  const agg = new Map<string, any>();
  const failed: string[] = [];

  const fetchBatch = async (batch: string[]) => {
    const blocks = await g.all(`${wabaId}/template_analytics`, {
      start, end, granularity: "daily",
      metric_types: "sent,delivered,read,clicked,cost",
      template_ids: JSON.stringify(batch),
    });
    for (const b of blocks as any[]) {
      for (const dp of b.data_points || []) {
        const day = bucketDay(Number(dp.start), Number(dp.end));
        const clicks = (dp.clicked || [])
          .filter((c: any) => c.type !== "unique_url_button")
          .reduce((a: number, c: any) => a + (c.count || 0), 0);
        const cost = (dp.cost || []).find((c: any) => c.type === "amount_spent")?.value || 0;
        agg.set(`${dp.template_id}|${day}`, {
          template_id: String(dp.template_id), waba_id: wabaId, day,
          sent: dp.sent || 0, delivered: dp.delivered || 0, read: dp.read || 0, clicks, cost: Number(cost),
        });
      }
    }
  };

  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    try {
      await fetchBatch(batch);
    } catch {
      // a Meta às vezes recusa o lote inteiro por causa de um template; tenta um a um
      for (const id of batch) {
        try { await fetchBatch([id]); } catch (e: any) { failed.push(`${id} (${e.message})`); }
      }
    }
  }
  await upsert("template_daily", [...agg.values()], ["template_id", "day"]);
  if (failed.length === ids.length) throw new Error(`Meta recusou as métricas de todos os templates: ${failed[0]}`);
  return `${agg.size} linha(s)` + (failed.length ? ` · ${failed.length} template(s) sem métricas: ${failed.join(", ")}` : "");
}

/** Liga os insights de templates nas contas indicadas (irreversível na Meta) e baixa as métricas delas. */
export async function enableTemplateInsights(s: Settings, wabaIds: string[], days = 90) {
  const log: LogLine[] = [];
  for (const id of wabaIds) {
    try {
      const g = await graphForWaba(s, id);
      const w: any = await g.get(id, { fields: WABA_FIELDS });
      if (!w.is_enabled_for_insights) await g.post(id, { is_enabled_for_insights: "true" });
      await query("update wabas set insights = true, updated_at = now() where id = $1", [id]);
      const templates = await query<{ id: string; status: string | null }>("select id, status from templates where waba_id = $1", [id]);
      const info = await syncTemplateAnalytics(g, id, templates, days);
      log.push({ step: w.name || id, ok: true, info });
    } catch (e: any) {
      log.push({ step: id, ok: false, info: e.message });
    }
  }
  return log;
}

/** Conexões a sincronizar: as ativas (ou as indicadas). Sem nenhuma cadastrada, usa o token antigo das Configurações. */
async function connectionsToSync(s: Settings, ids?: number[]): Promise<Connection[]> {
  const all = await listConnections();
  if (!all.length && s.meta_token && !ids) { // só na sincronização completa (Master ou rotina diária)
    return [{ id: 0, name: s.meta_business_name || "Configurações", kind: "whatsapp_cloud", business_id: s.meta_business_id, business_name: s.meta_business_name, token: s.meta_token,
      app_id: null, app_secret: null, waba_ids: s.meta_waba_ids, visibility: "private", active: true, status: null, last_error: null, last_sync_at: null, created_by: null, created_at: "", updated_at: "" }];
  }
  return all.filter((c) => c.active && (!ids || ids.includes(c.id)));
}

/** Sincroniza uma conexão (BM): contas, números, templates, mensagens, custos e métricas. */
async function syncConnection(s: Settings, conn: Connection, days: number, log: LogLine[]) {
  const g = new Graph(conn.token, s.graph_version || "v26.0");
  const push = (l: LogLine) => log.push({ ...l, conn: conn.id || undefined });
  const mine: LogLine[] = [];
  const add = (l: LogLine) => { mine.push(l); push(l); };
  try {
    // nome do portfólio (BM) — só para exibição
    if (conn.business_id) {
      try {
        const b: any = await g.get(conn.business_id, { fields: "name" });
        if (b?.name) {
          if (conn.id) await query("update connections set business_name = $2 where id = $1", [conn.id, String(b.name)]);
          if (conn.business_id === s.meta_business_id) await query("update settings set meta_business_name = $1 where id = 1", [String(b.name)]);
        }
      } catch { /* sem permissão business_management: segue sem nome */ }
    }
    const sub: LogLine[] = [];
    const listed = await listWabas(g, conn, sub);
    for (const l of sub) add({ ...l, step: `${conn.name} · ${l.step}` });
    // cada conta (WABA) pertence a uma só conexão: fica com a primeira que a trouxe, e a conexão "Só Master" sempre tem prioridade.
    // Assim, uma BM da equipe que também enxergue uma conta da BM privada (ex.: como parceira) nunca a expõe para a equipe.
    const owners = conn.id && listed.length
      ? await query<{ id: string; connection_id: number | null; visibility: string | null; name: string | null }>(
        "select w.id, w.connection_id, c.visibility, c.name from wabas w left join connections c on c.id = w.connection_id where w.id = any($1::text[])",
        [listed.map((w: any) => String(w.id))])
      : [];
    const ownerOf = new Map(owners.map((o) => [o.id, o]));
    // conta "alocada": o Master a listou explicitamente em "Limitar contas" de uma conexão. Ela pertence a essa conexão e a nenhuma
    // outra — nem a BM Só Master a rouba, nem a regra de alcance a tira da equipe (foi uma decisão explícita do Master).
    const pinnedTo = new Map<string, { id: number; name: string }>();
    if (conn.id) {
      for (const c of await listConnections()) for (const id of (c.waba_ids || "").split(",").map((x) => x.trim()).filter(Boolean)) if (!pinnedTo.has(id)) pinnedTo.set(id, { id: c.id, name: c.name });
    }
    // conta nova (ainda sem dona) vista por uma BM da Equipe: se alguma BM "Só Master" também a acessa, ela não vai para a equipe
    const privateReach = new Set<string>();
    if (conn.id && conn.visibility === "team") {
      const fresh = listed.map((w: any) => String(w.id)).filter((id: string) => { const o = ownerOf.get(id); return pinnedTo.get(id)?.id !== conn.id && (!o || !o.connection_id || o.visibility == null); });
      if (fresh.length) {
        const privTokens = [...new Set([...(await listConnections()).filter((c) => c.visibility !== "team").map((c) => c.token), s.meta_token].filter(Boolean))];
        for (const id of fresh) {
          for (const tok of privTokens) {
            try { await new Graph(tok, s.graph_version || "v26.0").get(id, { fields: "id" }); privateReach.add(id); break; } catch { /* sem acesso: segue */ }
          }
        }
      }
    }
    const wabas = listed.filter((w: any) => {
      const o = ownerOf.get(String(w.id));
      const pin = pinnedTo.get(String(w.id));
      if (pin && pin.id !== conn.id) {
        add({ step: `${conn.name} · ${w.name || w.id}`, ok: true, info: `conta alocada à conexão "${pin.name}" — ignorada aqui` });
        return false;
      }
      if (pin && pin.id === conn.id) return true; // alocada a esta conexão pelo Master
      if (privateReach.has(String(w.id))) {
        add({ step: `${conn.name} · ${w.name || w.id}`, ok: true, info: "conta também acessível por uma BM Só Master — fica fora da equipe (sincronize a BM Só Master para trazê-la)" });
        return false;
      }
      if (!o || !o.connection_id || o.connection_id === conn.id || o.visibility == null) return true; // livre ou já é desta conexão
      if (conn.visibility === "private" && o.visibility === "team") {
        add({ step: `${conn.name} · ${w.name || w.id}`, ok: true, info: `conta trazida da conexão "${o.name}" para esta (Só Master)` });
        return true;
      }
      add({ step: `${conn.name} · ${w.name || w.id}`, ok: true, info: `já pertence à conexão "${o.name}" — ignorada aqui` });
      return false;
    });
    await upsert("wabas", wabas.map((w: any) => ({
      id: String(w.id), name: w.name ?? null, currency: w.currency ?? null, timezone_id: w.timezone_id ?? null,
      ownership: w.ownership, insights: w.is_enabled_for_insights ?? null, updated_at: new Date().toISOString(),
      ...(conn.id ? { connection_id: conn.id } : {}),
    })), ["id"]);
    forgetConnectionCache();

    for (const w of wabas) {
      const label = w.name || w.id;
      // Métricas de custo e de templates dependem de permissão que a BM dona concede ao SEU app. Numa conta compartilhada
      // por parceria, a Meta devolve "código 10" (sem permissão) — é esperado, não é erro de configuração. Nesses passos,
      // tratamos o 10/200 como aviso suave (não quebra a sincronização nem acende alerta na conexão).
      const isPermission = (e: any) => e?.code === 10 || e?.code === 200 || /\(código (?:10|200)\)/.test(String(e?.message || ""));
      const step = async (name: string, fn: () => Promise<any>, soft = false) => {
        try {
          const r = await fn();
          add({ step: `${label} · ${name}`, ok: true, info: typeof r === "number" ? `${r} linha(s)` : typeof r === "string" ? r : Array.isArray(r) ? `${r.length} registro(s)` : undefined });
          return r;
        } catch (e: any) {
          if (soft && isPermission(e)) {
            add({ step: `${label} · ${name}`, ok: true, info: conn.visibility === "team" ? "indisponível para conta compartilhada por parceria" : "indisponível (sem permissão de métricas nesta conta)" });
            return null;
          }
          add({ step: `${label} · ${name}`, ok: false, info: e.message });
          return null;
        }
      };
      // garante que o app recebe os webhooks desta conta
      await step("webhook inscrito", () => g.post(`${w.id}/subscribed_apps`).then(() => "ok"));
      if (s.insights_enabled && !w.is_enabled_for_insights) {
        await step("insights de templates ativados", () => g.post(w.id, { is_enabled_for_insights: "true" }).then(() => "ok"));
      }
      const phones = (await step("números", () => syncPhones(g, w.id))) || [];
      const templates = (await step("templates", () => syncTemplates(g, w.id))) || [];
      await step("mensagens", () => syncMessages(g, w.id, phones, days), true);
      await step("custos", () => syncCosts(g, w.id, days), true);
      await step("métricas de templates", () => syncTemplateAnalytics(g, w.id, templates, days), true);
    }
  } catch (e: any) {
    add({ step: `${conn.name} · geral`, ok: false, info: e.message });
  }
  if (conn.id) {
    const errors = mine.filter((l) => !l.ok);
    // erro "de conexão" (token/portfólio) ≠ erro pontual de uma etapa (ex.: métricas desligadas)
    const fatal = errors.find((l) => /geral|contas da BM|contas de clientes|conta \d/.test(l.step) && !mine.some((m) => m.ok && /contas/.test(m.step)));
    await query("update connections set status = $2, last_error = $3, last_sync_at = now(), updated_at = now() where id = $1",
      [conn.id, fatal ? "error" : errors.length ? "warning" : "ok", (fatal || errors[0])?.info?.slice(0, 500) || null]);
  }
}

export async function runSync(s: Settings, days = 7, opts: { connectionIds?: number[] } = {}) {
  const log: LogLine[] = [];
  const [run] = await query<{ id: number }>("insert into sync_runs (details) values ($1) returning id", [{ days }]);
  try {
    const conns = await connectionsToSync(s, opts.connectionIds);
    if (!conns.length) log.push({ step: "conexões", ok: false, info: "Nenhuma conexão ativa. Cadastre uma BM em Conexões." });
    for (const conn of conns) await syncConnection(s, conn, days, log);
  } catch (e: any) {
    log.push({ step: "geral", ok: false, info: e.message });
  }
  try { await query("delete from webhook_log where received_at < now() - interval '30 days'"); } catch { /* limpeza opcional */ }
  try {
    const closed = await autoCloseStale(s.autoclose_days ?? 0);
    if (closed) log.push({ step: "conversas encerradas por inatividade", ok: true, info: `${closed}` });
  } catch (e: any) { log.push({ step: "encerramento automático", ok: false, info: e.message }); }
  const ok = !log.some((l) => !l.ok);
  if (run?.id) {
    await query("update sync_runs set ok = $1, finished_at = now(), details = $2 where id = $3", [ok, { days, log, connections: opts.connectionIds ?? null }, run.id]);
  }
  return { ok, log };
}
