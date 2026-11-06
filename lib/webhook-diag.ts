// Diagnóstico do webhook: o que a Meta tem configurado para o app, quais contas estão inscritas
// e o que já chegou por aqui. Também configura o webhook do app sozinho (via token do app).
import { Graph } from "./meta";
import { query } from "./db";
import type { Settings } from "./settings";
import { connectionForWaba, graphForWaba, listConnections } from "./connections";
import type { Scope } from "./access";

/** Contas visíveis no escopo (null = todas). */
const scoped = (scope?: Scope | null) => (scope && !scope.all ? scope.wabas : null);
async function visibleWabas(scope?: Scope | null) {
  const only = scoped(scope);
  return query<{ id: string; name: string | null }>(`select id, name from wabas ${only ? "where id = any($1::text[])" : ""} order by name`, only ? [only] : []);
}

export const WEBHOOK_FIELDS = [
  "messages",
  "message_template_status_update",
  "message_template_quality_update",
  "template_category_update",
  "phone_number_quality_update",
  "account_update",
  // número em coexistência (também no app do celular): ecos do que a equipe manda pelo app e nomes da agenda
  "smb_message_echoes",
  "smb_app_state_sync",
];

export type AppStatus = {
  available: boolean;        // temos ID e chave secreta do app para consultar
  configured: boolean;       // existe assinatura do objeto whatsapp_business_account
  callback_url: string | null;
  matches: boolean;          // a URL configurada é a deste sistema
  active: boolean | null;
  fields: string[];
  missing_fields: string[];
  error?: string;
};

export type WabaStatus = {
  id: string; name: string | null; subscribed: boolean;
  apps: { id: string; name: string | null }[];
  error?: string;
};

export type TokenStatus = {
  valid: boolean | null; type: string | null; app_id: string | null; app_name: string | null;
  expires_at: string | null; scopes: string[]; missing_scopes: string[]; error?: string;
};

export type EventStats = {
  last_at: string | null;
  last24h: { messages: number; statuses: number; inbound: number; other: number; invalid_signature: number };
  total: { inbound_messages: number; outbound_messages: number; external_messages: number; conversations: number };
  recent: { received_at: string; field: string; waba_id: string | null; summary: string }[];
};

export type Diagnosis = { base: string; app: AppStatus; wabas: WabaStatus[]; token: TokenStatus; events: EventStats; checked_at: string };

const REQUIRED_SCOPES = ["whatsapp_business_messaging", "whatsapp_business_management"];

function appToken(s: Settings) {
  return s.meta_app_id && s.meta_app_secret ? `${s.meta_app_id}|${s.meta_app_secret}` : null;
}

export async function appStatus(s: Settings, base: string): Promise<AppStatus> {
  const tok = appToken(s);
  const empty: AppStatus = { available: false, configured: false, callback_url: null, matches: false, active: null, fields: [], missing_fields: WEBHOOK_FIELDS };
  if (!tok) return { ...empty, error: "Informe o ID e a chave secreta do app principal em Configurações" };
  try {
    const g = new Graph(tok, s.graph_version || "v26.0");
    const r = await g.get<{ data: any[] }>(`${s.meta_app_id}/subscriptions`);
    const sub = (r.data || []).find((d) => d.object === "whatsapp_business_account");
    if (!sub) return { ...empty, available: true };
    const fields = (sub.fields || []).map((f: any) => (typeof f === "string" ? f : f.name)).filter(Boolean);
    const expected = `${base}/api/webhook`;
    return {
      available: true, configured: true, callback_url: sub.callback_url ?? null,
      matches: (sub.callback_url || "").replace(/\/$/, "") === expected, active: sub.active ?? null,
      fields, missing_fields: WEBHOOK_FIELDS.filter((f) => !fields.includes(f)),
    };
  } catch (e: any) {
    return { ...empty, available: true, error: e.message };
  }
}

/** Grava a URL de callback, o token de verificação e os campos no app da Meta (a Meta confere a URL na hora). */
export async function configureApp(s: Settings, base: string) {
  const tok = appToken(s);
  if (!tok) throw new Error("Informe o ID e a chave secreta do app principal em Configurações");
  const g = new Graph(tok, s.graph_version || "v26.0");
  await g.post(`${s.meta_app_id}/subscriptions`, {
    object: "whatsapp_business_account",
    callback_url: `${base}/api/webhook`,
    verify_token: s.webhook_verify_token,
    fields: WEBHOOK_FIELDS.join(","),
    include_values: "true",
  });
}

export async function wabaStatuses(s: Settings, scope?: Scope | null): Promise<WabaStatus[]> {
  const wabas = await visibleWabas(scope);
  const out: WabaStatus[] = [];
  for (const w of wabas) {
    try {
      const g = await graphForWaba(s, w.id); // token da BM dona da conta
      const appId = (await connectionForWaba(w.id))?.app_id || s.meta_app_id;
      const r = await g.get<{ data: any[] }>(`${w.id}/subscribed_apps`);
      const apps = (r.data || []).map((d) => ({ id: String(d.whatsapp_business_api_data?.id ?? d.id ?? ""), name: d.whatsapp_business_api_data?.name ?? d.name ?? null }));
      const subscribed = appId ? apps.some((a) => a.id === String(appId)) : apps.length > 0;
      out.push({ id: w.id, name: w.name, subscribed, apps });
    } catch (e: any) {
      out.push({ id: w.id, name: w.name, subscribed: false, apps: [], error: e.message });
    }
  }
  return out;
}

/** Inscreve o app em todas as contas visíveis (o mesmo passo da sincronização), cada uma com o token da sua BM. */
export async function subscribeAll(s: Settings, scope?: Scope | null) {
  const wabas = await visibleWabas(scope);
  const results: { id: string; name: string | null; ok: boolean; error?: string }[] = [];
  for (const w of wabas) {
    try { await (await graphForWaba(s, w.id)).post(`${w.id}/subscribed_apps`); results.push({ id: w.id, name: w.name, ok: true }); }
    catch (e: any) { results.push({ id: w.id, name: w.name, ok: false, error: e.message }); }
  }
  return results;
}

/** Confere um token de usuário do sistema (validade, app e permissões). Sem token informado, usa o da primeira conexão visível. */
export async function tokenStatus(s: Settings, scope?: Scope | null, input?: { token: string; app_id?: string | null; app_secret?: string | null }): Promise<TokenStatus> {
  const empty: TokenStatus = { valid: null, type: null, app_id: null, app_name: null, expires_at: null, scopes: [], missing_scopes: REQUIRED_SCOPES };
  let target = input || null;
  if (!target) {
    const only = scoped(scope);
    const visible = (await listConnections()).filter((c) => (scope?.all ?? true) || (scope?.view === "team" ? c.visibility === "team" : c.visibility !== "team"));
    const c = visible[0];
    if (c) target = { token: c.token, app_id: c.app_id, app_secret: c.app_secret };
    else if (!only) target = { token: s.meta_token };
  }
  if (!target?.token) return { ...empty, error: "Nenhuma conexão cadastrada" };
  const ownApp = target.app_id && target.app_secret ? `${target.app_id}|${target.app_secret}` : null;
  // confere com o token do app (próprio da conexão ou o principal); se o token for de outro app, ele mesmo se confere
  const viewers = [...new Set([ownApp, appToken(s), target.token].filter(Boolean) as string[])];
  try {
    const got: { viewer: string; r: { data: any } }[] = [];
    let last: any = null;
    for (const tok of viewers) {
      try {
        const x = await new Graph(tok, s.graph_version || "v26.0").get<{ data: any }>("debug_token", { input_token: target.token });
        got.push({ viewer: tok, r: x });
        if (x?.data?.is_valid) break;
      } catch (e) { last = e; }
    }
    // válido por qualquer um > resposta do próprio token > a primeira que veio
    const r = (got.find((g) => g.r?.data?.is_valid) || got.find((g) => g.viewer === target!.token) || got[0])?.r;
    if (!r) throw last || new Error("Não foi possível conferir o token");
    const d = r.data || {};
    const scopes: string[] = d.scopes || [];
    return {
      valid: d.is_valid ?? null, type: d.type ?? null, app_id: d.app_id ? String(d.app_id) : null, app_name: d.application ?? null,
      expires_at: d.expires_at ? (d.expires_at === 0 ? "never" : new Date(d.expires_at * 1000).toISOString()) : "never",
      scopes, missing_scopes: REQUIRED_SCOPES.filter((x) => !scopes.includes(x)),
      error: d.error?.message,
    };
  } catch (e: any) {
    return { ...empty, error: e.message };
  }
}

export async function eventStats(scope?: Scope | null): Promise<EventStats> {
  const only = scoped(scope);
  // eventos sem conta (ex.: assinatura inválida) são gerais; os de uma conta só aparecem para quem a vê
  const W = only ? "and (waba_id is null or waba_id = any($1::text[]))" : "";
  const M = only ? "and waba_id = any($1::text[])" : "";
  const args = only ? [only] : [];
  const [agg] = await query<any>(`
    select
      (select max(received_at) from webhook_log where true ${W}) as last_at,
      (select count(*) from webhook_log where field = 'messages' and received_at > now() - interval '24 hours' ${W}) as messages,
      (select coalesce(sum((payload->>'statuses')::int), 0) from webhook_log where field = 'messages' and received_at > now() - interval '24 hours' ${W}) as statuses,
      (select coalesce(sum((payload->>'messages')::int), 0) from webhook_log where field = 'messages' and received_at > now() - interval '24 hours' ${W}) as inbound,
      (select count(*) from webhook_log where field not in ('messages', 'assinatura_invalida') and received_at > now() - interval '24 hours' ${W}) as other,
      (select count(*) from webhook_log where field = 'assinatura_invalida' and received_at > now() - interval '24 hours') as invalid_signature,
      (select count(*) from messages where direction = 'in' ${M}) as inbound_messages,
      (select count(*) from messages where direction = 'out' and type <> 'external' ${M}) as outbound_messages,
      (select count(*) from messages where type = 'external' ${M}) as external_messages,
      (select count(*) from conversations where true ${M}) as conversations
  `, args);
  const recent = await query<any>(`select received_at, field, waba_id, payload from webhook_log where true ${W} order by received_at desc limit 12`, args);
  const phones = await query<{ id: string; display_phone_number: string | null; verified_name: string | null }>("select id, display_phone_number, verified_name from phone_numbers");
  const phoneName = new Map(phones.map((p) => [p.id, p.verified_name || p.display_phone_number || p.id]));
  return {
    last_at: agg?.last_at ?? null,
    last24h: { messages: Number(agg?.messages || 0), statuses: Number(agg?.statuses || 0), inbound: Number(agg?.inbound || 0), other: Number(agg?.other || 0), invalid_signature: Number(agg?.invalid_signature || 0) },
    total: { inbound_messages: Number(agg?.inbound_messages || 0), outbound_messages: Number(agg?.outbound_messages || 0), external_messages: Number(agg?.external_messages || 0), conversations: Number(agg?.conversations || 0) },
    recent: recent.map((r) => ({ received_at: r.received_at, field: r.field, waba_id: r.waba_id, summary: summarize(r.field, r.payload, phoneName) })),
  };
}

function summarize(field: string, p: any, phoneName: Map<string, string>): string {
  if (!p) return "";
  if (field === "messages") {
    const parts = [];
    if (p.messages) parts.push(`${p.messages} recebida(s)`);
    if (p.statuses) parts.push(`${p.statuses} status (${p.status_kinds || ""})`.replace(" ()", ""));
    return parts.join(" · ") + (p.phone_number_id ? ` · ${phoneName.get(String(p.phone_number_id)) || `número ${p.phone_number_id}`}` : "");
  }
  if (field === "assinatura_invalida") return "Assinatura inválida — confira a chave secreta do app";
  // (eventos recebidos antes de o HUB tratar estes campos ficaram no log com o conteúdo inteiro, sem o resumo)
  if (field === "smb_message_echoes") {
    const pn = p.phone_number_id ?? p.metadata?.phone_number_id;
    return `${p.echoes ?? (Array.isArray(p.message_echoes) ? p.message_echoes.length : 0)} enviada(s) pelo celular` + (pn ? ` · ${phoneName.get(String(pn)) || `número ${pn}`}` : "");
  }
  if (field === "smb_app_state_sync") return `${p.contacts ?? (Array.isArray(p.state_sync) ? p.state_sync.length : 0)} contato(s) da agenda do celular`;
  if (field.startsWith("message_template")) return `${p.message_template_name || p.message_template_id || ""} ${p.event || p.new_quality_score || ""}`.trim();
  if (field === "phone_number_quality_update") return `${p.display_phone_number || ""} ${p.event || ""} ${p.current_limit || ""}`.trim();
  if (field === "account_update") return `${p.event || ""}`;
  return JSON.stringify(p).slice(0, 120);
}

export async function diagnose(s: Settings, base: string, scope?: Scope | null): Promise<Diagnosis> {
  const [app, wabas, token, events] = await Promise.all([appStatus(s, base), wabaStatuses(s, scope), tokenStatus(s, scope), eventStats(scope)]);
  return { base, app, wabas, token, events, checked_at: new Date().toISOString() };
}
