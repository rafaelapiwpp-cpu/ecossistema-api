// Conexões: cada BM (portfólio) com o seu token. Só o Master cria, edita, liga/desliga e remove;
// administradores e gestores veem as conexões da Equipe (sem token) e podem sincronizá-las e nomear os números.
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { isAdminRole, isMaster } from "@/lib/roles";
import { canSee, clearScopeCache, getScope } from "@/lib/access";
import { forgetConnectionCache, getConnection, graphForPhone, listConnections, maskSecret, propagateToken, wabaIdsOf, type Connection } from "@/lib/connections";
import { Graph } from "@/lib/meta";
import { listWabas, runSync, type LogLine } from "@/lib/sync";
import { tokenStatus } from "@/lib/webhook-diag";
import { siteUrl } from "@/lib/site";
import { seal } from "@/lib/secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const str = (v: any) => String(v ?? "").trim();
const digits = (v: any) => str(v).replace(/\D/g, "");
/** "123, 456 789" → "123,456,789" (só números, sem repetidos). */
const idList = (v: any) => [...new Set(str(v).split(/[\s,;]+/).map((x) => x.replace(/\D/g, "")).filter(Boolean))].join(",");

/** O que a tela recebe de cada conexão (o token nunca sai inteiro; para a equipe, nem mascarado). */
function publicConn(c: Connection, master: boolean) {
  return {
    id: c.id, name: c.name, kind: c.kind, business_id: c.business_id, business_name: c.business_name,
    description: c.description ?? null,
    visibility: c.visibility, active: c.active, status: c.status, last_error: c.last_error, last_sync_at: c.last_sync_at,
    created_at: c.created_at, updated_at: c.updated_at,
    ...(master ? { token_hint: maskSecret(c.token), app_id: c.app_id, has_app_secret: !!c.app_secret, waba_ids: c.waba_ids, source_connection_id: c.source_connection_id ?? null } : {}),
  };
}

export async function GET() {
  const r = await requireSession({ manager: true });
  if ("res" in r) return r.res;
  const master = isMaster(r.user.role);
  const all = await listConnections();
  const conns = master ? all : all.filter((c) => c.visibility === "team");
  const ids = conns.map((c) => c.id);
  const [wabas, phones, tpl, run, watch] = await Promise.all([
    query<any>(`select id, name, currency, ownership, connection_id, updated_at from wabas
                where connection_id = any($1::int[]) ${master ? "or connection_id is null" : ""} order by name nulls last, id`, [ids]),
    query<any>(`select p.id, p.waba_id, p.display_phone_number, p.verified_name, p.quality_rating, p.messaging_limit, p.status, p.name_status, p.label
                from phone_numbers p join wabas w on w.id = p.waba_id
                where w.connection_id = any($1::int[]) ${master ? "or w.connection_id is null" : ""} order by p.display_phone_number`, [ids]),
    query<{ waba_id: string; status: string; n: number }>("select waba_id, status, count(*)::int as n from templates group by waba_id, status"),
    query<any>("select started_at, finished_at, ok, details from sync_runs order by started_at desc limit 1"),
    query<{ phone_number_id: string }>("select phone_number_id from user_watch_phones where user_id = $1", [r.user.id]),
  ]);
  const watched = new Set(watch.map((x) => x.phone_number_id));
  const tplOf = (wabaId: string) => {
    const rows = tpl.filter((t) => t.waba_id === wabaId);
    const n = (...st: string[]) => rows.filter((t) => st.includes(t.status)).reduce((a, t) => a + t.n, 0);
    return { approved: n("APPROVED"), pending: n("PENDING", "IN_APPEAL"), rejected: n("REJECTED", "PAUSED", "DISABLED") };
  };
  const wabaOut = (w: any) => ({ ...w, templates: tplOf(w.id), phones: phones.filter((p) => p.waba_id === w.id).map((p) => ({ ...p, watched: watched.has(p.id) })) });
  const last = run[0];
  const log: LogLine[] = ((last?.details as any)?.log || []).filter((l: LogLine) => l.conn && ids.includes(l.conn));
  const base = master ? await siteUrl() : "";
  return NextResponse.json({
    me: { master, admin: isAdminRole(r.user.role), role: r.user.role },
    connections: conns.map((c) => ({ ...publicConn(c, master), wabas: wabas.filter((w) => w.connection_id === c.id).map(wabaOut) })),
    unlinked: master ? wabas.filter((w) => w.connection_id == null).map(wabaOut) : [],
    last_sync: last ? { at: last.finished_at || last.started_at, problems: log.filter((l) => !l.ok) } : null,
    webhook: master ? { url: `${base}/api/webhook`, verify_token: r.s.webhook_verify_token, main_app_id: r.s.meta_app_id || null } : null,
  });
}

export async function POST(req: Request) {
  const r = await requireSession({ manager: true });
  if ("res" in r) return r.res;
  const { s, user } = r;
  const master = isMaster(user.role);
  const b = await req.json().catch(() => ({}));
  const bad = (m: string, code = 400) => NextResponse.json({ error: m }, { status: code });
  const onlyMaster = () => (master ? null : bad("Apenas o Master gerencia as conexões", 403));
  /** Conexão que este usuário pode operar (Master: qualquer uma; demais: só as da Equipe). */
  const reach = async (id: number) => {
    const c = id ? await getConnection(id) : null;
    return c && (master || c.visibility === "team") ? c : null;
  };

  try {
    switch (b.action) {
      // ---- criar / editar (Master) ----
      case "save": {
        const deny = onlyMaster(); if (deny) return deny;
        const id = Number(b.id) || 0;
        const name = str(b.name);
        const visibility = b.visibility === "team" ? "team" : "private";
        const business_id = digits(b.business_id) || null;
        const waba_ids = idList(b.waba_ids) || null;
        const token = str(b.token).replace(/\s+/g, "");
        const own = Boolean(b.own_app);
        const app_id = own ? digits(b.app_id) || null : null;
        const app_secret = own ? str(b.app_secret) : "";
        const description = str(b.description).slice(0, 280) || null;
        if (!name) return bad("Dê um nome para a conexão");
        if (!business_id && !waba_ids) return bad("Informe o ID do portfólio (BM) ou os IDs das contas (WABA)");
        if (own && !app_id) return bad("Informe o ID do app próprio, ou use o app principal");
        if (token && !/^[A-Za-z0-9_\-|.]{20,}$/.test(token)) return bad("O token não parece válido — cole o token completo do usuário do sistema");
        let cur: Connection | null = null;
        if (id) {
          cur = await getConnection(id);
          if (!cur) return bad("Conexão não encontrada", 404);
          if (own && !app_secret && !(cur.app_id && cur.app_secret)) return bad("Informe a chave secreta do app próprio (necessária para validar o webhook)");
          await query(
            `update connections set name = $2, visibility = $3, business_id = $4, token = coalesce(nullif($5, ''), token), app_id = $6,
               app_secret = case when $6::text is null then null else coalesce(nullif($7, ''), app_secret) end,
               waba_ids = $8, description = $9, updated_at = now() where id = $1`,
            [id, name, visibility, business_id, seal(token), app_id, seal(app_secret), waba_ids, description],
          );
          await propagateToken(id); // conexões criadas a partir desta acompanham token e app
        } else {
          if (!token) return bad("Cole o token de acesso do usuário do sistema da BM");
          if (own && !app_secret) return bad("Informe a chave secreta do app próprio (necessária para validar o webhook)");
          const [row] = await query<{ id: number }>(
            `insert into connections (name, visibility, business_id, token, app_id, app_secret, waba_ids, description, created_by) values ($1, $2, $3, $4, $5, nullif($6, ''), $7, $8, $9) returning id`,
            [name, visibility, business_id, seal(token), app_id, seal(app_secret), waba_ids, description, user.id],
          );
          cur = await getConnection(row.id);
        }
        const connId = cur!.id;
        // contas que ficaram fora do limite desta conexão deixam de pertencer a ela (passam a ser só do Master até outra conexão trazê-las)
        if (waba_ids) await query("update wabas set connection_id = null where connection_id = $1 and not (id = any($2::text[]))", [connId, waba_ids.split(",")]);
        forgetConnectionCache();
        let sync: { ok: boolean; log: LogLine[] } | null = null;
        if (b.sync) {
          const out = await runSync(s, 7, { connectionIds: [connId] });
          sync = { ok: out.ok, log: out.log.filter((l) => !l.conn || l.conn === connId) };
        }
        return NextResponse.json({ ok: true, id: connId, sync });
      }

      // ---- testar as credenciais antes de salvar (Master) ----
      case "test": {
        const deny = onlyMaster(); if (deny) return deny;
        const cur = Number(b.id) ? await getConnection(Number(b.id)) : null;
        const token = str(b.token).replace(/\s+/g, "") || cur?.token || "";
        if (!token) return bad("Cole o token para testar");
        const business_id = digits(b.business_id) || null;
        const waba_ids = idList(b.waba_ids) || null;
        const own = Boolean(b.own_app);
        const app_id = own ? digits(b.app_id) || null : null;
        const app_secret = own ? str(b.app_secret) || (cur?.app_id === app_id ? cur?.app_secret : null) || null : null;
        const g = new Graph(token, s.graph_version || "v26.0");
        const errors: string[] = [];
        const tk = await tokenStatus(s, null, { token, app_id, app_secret });
        let business: { id: string; name: string | null } | null = null;
        if (business_id) {
          try { const x: any = await g.get(business_id, { fields: "name" }); business = { id: business_id, name: x?.name ?? null }; }
          catch (e: any) { errors.push(`Portfólio ${business_id}: ${e.message}`); }
        }
        const log: LogLine[] = [];
        let found: any[] = [];
        try { found = await listWabas(g, { business_id, waba_ids }, log); } catch (e: any) { errors.push(e.message); }
        for (const l of log) if (!l.ok) errors.push(`${l.step}: ${l.info}`);
        // dono atual de cada conta no HUB (para avisar quando ela já está em outra conexão)
        const owners = found.length
          ? await query<{ id: string; connection_id: number | null; name: string | null; visibility: string | null }>(
            "select w.id, w.connection_id, c.name, c.visibility from wabas w left join connections c on c.id = w.connection_id where w.id = any($1::text[])", [found.map((w) => String(w.id))])
          : [];
        const wabas = [];
        for (const w of found.slice(0, 30)) {
          let phones: any[] = [];
          try { phones = (await g.get<{ data: any[] }>(`${w.id}/phone_numbers`, { fields: "id,display_phone_number,verified_name,quality_rating,status", limit: "50" })).data || []; }
          catch (e: any) { errors.push(`${w.name || w.id} · números: ${e.message}`); }
          const o = owners.find((x) => x.id === String(w.id));
          const other = o?.connection_id && o.connection_id !== cur?.id ? { name: o.name, visibility: o.visibility } : null;
          wabas.push({ id: String(w.id), name: w.name ?? null, ownership: w.ownership, currency: w.currency ?? null, phones: phones.map((p) => ({ id: String(p.id), display_phone_number: p.display_phone_number ?? null, verified_name: p.verified_name ?? null, quality_rating: p.quality_rating ?? null, status: p.status ?? null })), other });
        }
        const ok = tk.valid !== false && !tk.error && wabas.length > 0;
        return NextResponse.json({ ok, token: tk, business, wabas, total_wabas: found.length, errors });
      }

      // ---- ligar / desligar (Master) ----
      case "toggle": {
        const deny = onlyMaster(); if (deny) return deny;
        const c = await getConnection(Number(b.id));
        if (!c) return bad("Conexão não encontrada", 404);
        await query("update connections set active = $2, updated_at = now() where id = $1", [c.id, Boolean(b.active)]);
        forgetConnectionCache();
        return NextResponse.json({ ok: true });
      }

      // ---- remover (Master): as contas e o histórico continuam no HUB, visíveis só para o Master ----
      case "delete": {
        const deny = onlyMaster(); if (deny) return deny;
        const c = await getConnection(Number(b.id));
        if (!c) return bad("Conexão não encontrada", 404);
        await query("update wabas set connection_id = null where connection_id = $1", [c.id]);
        // conexões criadas a partir desta ficam com a cópia do token que já têm, mas deixam de "seguir" uma origem que não existe mais
        await query("update connections set source_connection_id = null, updated_at = now() where source_connection_id = $1", [c.id]);
        await query("delete from connections where id = $1", [c.id]);
        forgetConnectionCache();
        return NextResponse.json({ ok: true });
      }

      // ---- mudar de BM (Master): conexões passam a usar o token (e o app) de outra conexão, sem perder contas nem histórico ----
      // Serve para trocar a BM "casa" do HUB: as contas das BMs parceiras precisam estar compartilhadas com a BM de destino e
      // atribuídas ao usuário do sistema do token dela. "transfer_check" só confere; "transfer" confere e transfere as escolhidas.
      case "transfer_check":
      case "transfer": {
        const deny = onlyMaster(); if (deny) return deny;
        const target = await getConnection(Number(b.target_id));
        if (!target) return bad("Conexão de destino não encontrada", 404);
        if (target.source_connection_id) return bad("Escolha como destino uma conexão com token próprio (não uma criada a partir de contas compartilhadas)");
        if (!target.token) return bad("A conexão de destino não tem token");
        const wanted: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter(Boolean) : [];
        if (b.action === "transfer" && !wanted.length) return bad("Escolha as conexões a transferir");
        const g = new Graph(target.token, s.graph_version || "v26.0");
        const all = await listConnections();
        const nameOf = (id: number | null | undefined) => all.find((c) => c.id === id)?.name || null;
        const candidates = all.filter((c) => c.id !== target.id && c.source_connection_id !== target.id && (!wanted.length || wanted.includes(c.id)));
        type Check = { id: string; name: string | null; ok: boolean; error?: string };
        const report: { id: number; name: string; visibility: string; active: boolean; source: { id: number | null; name: string | null }; wabas: Check[]; ready: boolean }[] = [];
        for (const c of candidates) {
          const ids = await wabaIdsOf(c);
          const known = ids.length ? await query<{ id: string; name: string | null }>("select id, name from wabas where id = any($1::text[])", [ids]) : [];
          const wabas: Check[] = [];
          for (const id of ids) {
            const name = known.find((w) => w.id === id)?.name ?? null;
            // o token de destino precisa enxergar a conta (compartilhada com a BM de destino E atribuída ao usuário do sistema)
            try { const w: any = await g.get(id, { fields: "id,name" }); wabas.push({ id, name: w?.name || name, ok: true }); }
            catch (e: any) { wabas.push({ id, name, ok: false, error: e.message }); }
          }
          report.push({ id: c.id, name: c.name, visibility: c.visibility, active: c.active, source: { id: c.source_connection_id ?? null, name: nameOf(c.source_connection_id) }, wabas, ready: wabas.every((w) => w.ok) });
        }
        const out = { target: { id: target.id, name: target.name, business_id: target.business_id, app_id: target.app_id }, candidates: report };
        if (b.action === "transfer_check") return NextResponse.json({ ok: true, ...out });
        const moved: { id: number; name: string; wabas: number }[] = [];
        const skipped: { id: number; name: string; reason: string }[] = [];
        for (const r of report) {
          if (!r.ready && !b.force) {
            const missing = r.wabas.filter((w) => !w.ok);
            skipped.push({ id: r.id, name: r.name, reason: `${missing.length} conta(s) ainda não acessível(is) pelo token de ${target.name}: ${missing.map((w) => w.name || w.id).join(", ")}` });
            continue;
          }
          await query(
            "update connections set source_connection_id = $2, token = $3, app_id = $4, app_secret = $5, updated_at = now() where id = $1",
            [r.id, target.id, seal(target.token), target.app_id, seal(target.app_secret)],
          );
          moved.push({ id: r.id, name: r.name, wabas: r.wabas.length });
        }
        forgetConnectionCache();
        let sync: { ok: boolean; log: LogLine[] } | null = null;
        // a sincronização inscreve cada conta no app do token novo (webhook) e confere números e templates
        if (b.sync !== false && moved.length) {
          const ids = moved.map((m) => m.id);
          const res = await runSync(s, Math.min(Math.max(Number(b.days) || 2, 1), 90), { connectionIds: ids });
          sync = { ok: res.ok, log: res.log.filter((l) => !l.conn || ids.includes(l.conn)) };
        }
        return NextResponse.json({ ok: true, ...out, moved, skipped, sync });
      }

      // ---- sincronizar uma conexão (Master: qualquer; demais: só as da Equipe) ----
      case "sync": {
        if (!master && !isAdminRole(user.role)) return bad("Apenas administradores", 403);
        const c = await reach(Number(b.id));
        if (!c) return bad("Conexão não encontrada", 404);
        if (!c.active) return bad("Ligue a conexão antes de sincronizar");
        const days = Math.min(Math.max(Number(b.days) || 7, 1), 365);
        const out = await runSync(s, days, { connectionIds: [c.id] });
        const log = out.log.filter((l) => l.conn === c.id || (!l.conn && /^conex|^geral/.test(l.step)));
        return NextResponse.json({ ok: !log.some((l) => !l.ok), log });
      }

      // ---- apelido interno do número (gestor+, só números visíveis) ----
      case "phone_label": {
        const pid = digits(b.phone_number_id);
        const [p] = await query<{ waba_id: string }>("select waba_id from phone_numbers where id = $1", [pid]);
        if (!p || !canSee(await getScope(user, master ? "all" : undefined), p.waba_id)) return bad("Número não encontrado", 404);
        await query("update phone_numbers set label = nullif($2, '') where id = $1", [pid, str(b.label).slice(0, 40)]);
        return NextResponse.json({ ok: true });
      }

      // ---- ativar o número na API de nuvem com o PIN de duas etapas (o PIN não fica salvo) ----
      case "register": {
        if (!master && !isAdminRole(user.role)) return bad("Apenas administradores", 403);
        const pid = digits(b.phone_number_id);
        const pin = digits(b.pin);
        if (!/^\d{6}$/.test(pin)) return bad("O PIN tem 6 dígitos");
        const [p] = await query<{ waba_id: string }>("select waba_id from phone_numbers where id = $1", [pid]);
        if (!p || !canSee(await getScope(user, master ? "all" : undefined), p.waba_id)) return bad("Número não encontrado", 404);
        const g = await graphForPhone(s, pid, { send: true });
        await g.json(`${pid}/register`, { messaging_product: "whatsapp", pin });
        return NextResponse.json({ ok: true });
      }

      // ---- contas que outras BMs compartilharam com uma BM conectada (parceria), agrupadas pela BM dona (Master) ----
      case "discover": {
        const deny = onlyMaster(); if (deny) return deny;
        const all = await listConnections();
        const sources = Number(b.source_id) ? all.filter((c) => c.id === Number(b.source_id)) : all.filter((c) => c.active && c.business_id && !c.source_connection_id);
        if (!sources.length) return bad("Nenhuma conexão com ID de portfólio para procurar contas compartilhadas");
        const mine = await query<{ id: string; connection_id: number | null; cname: string | null; visibility: string | null }>(
          "select w.id, w.connection_id, c.name as cname, c.visibility from wabas w left join connections c on c.id = w.connection_id");
        const current = new Map(mine.map((m) => [m.id, m]));
        const errors: string[] = [];
        type Found = { id: string; name: string | null; currency: string | null; phones: { id: string; display_phone_number: string | null; verified_name: string | null; quality_rating: string | null; status: string | null }[]; current: { connection_id: number; name: string | null; visibility: string | null } | null };
        const groups = new Map<string, { owner: { id: string; name: string }; source: { id: number; name: string }; existing: { id: number; name: string; visibility: string } | null; wabas: Found[] }>();
        for (const src of sources) {
          const g = new Graph(src.token, s.graph_version || "v26.0");
          let rows: any[] = [];
          try { rows = await g.all(`${src.business_id}/client_whatsapp_business_accounts`, { fields: "id,name,currency,owner_business_info" }); }
          catch (e: any) { errors.push(`${src.name}: ${e.message}`); continue; }
          for (const w of rows) {
            const owner = { id: String(w.owner_business_info?.id || "0"), name: String(w.owner_business_info?.name || "BM parceira") };
            if (owner.id === src.business_id) continue; // conta da própria BM (não é compartilhada)
            const key = `${src.id}|${owner.id}`;
            let grp = groups.get(key);
            if (!grp) {
              const ex = all.find((c) => c.business_id === owner.id && c.id !== src.id) || null;
              grp = { owner, source: { id: src.id, name: src.name }, existing: ex ? { id: ex.id, name: ex.name, visibility: ex.visibility } : null, wabas: [] };
              groups.set(key, grp);
            }
            let phones: any[] = [];
            try { phones = (await g.get<{ data: any[] }>(`${w.id}/phone_numbers`, { fields: "id,display_phone_number,verified_name,quality_rating,status", limit: "50" })).data || []; }
            catch (e: any) { errors.push(`${w.name || w.id} · números: ${e.message}`); }
            const cur = current.get(String(w.id));
            grp.wabas.push({
              id: String(w.id), name: w.name ?? null, currency: w.currency ?? null,
              phones: phones.map((p) => ({ id: String(p.id), display_phone_number: p.display_phone_number ?? null, verified_name: p.verified_name ?? null, quality_rating: p.quality_rating ?? null, status: p.status ?? null })),
              current: cur?.connection_id ? { connection_id: cur.connection_id, name: cur.cname, visibility: cur.visibility } : null,
            });
          }
        }
        const out = [...groups.values()].sort((a, b) => a.owner.name.localeCompare(b.owner.name, "pt-BR"));
        return NextResponse.json({ ok: true, groups: out, errors, sources: sources.map((c) => ({ id: c.id, name: c.name })) });
      }

      // ---- cria (ou completa) uma conexão de Equipe por BM dona, com as contas escolhidas e o token da conexão de origem (Master) ----
      case "adopt": {
        const deny = onlyMaster(); if (deny) return deny;
        const visibility = b.visibility === "private" ? "private" : "team";
        const groupsIn: { source_id: number; owner_id: string; owner_name: string; waba_ids: string[] }[] = Array.isArray(b.groups) ? b.groups : [];
        if (!groupsIn.length) return bad("Escolha pelo menos uma conta");
        const results: { owner: string; id: number; created: boolean; wabas: number }[] = [];
        const touched: number[] = [];
        for (const gi of groupsIn) {
          const src = await getConnection(Number(gi.source_id));
          if (!src) return bad("Conexão de origem não encontrada", 404);
          const ownerId = digits(gi.owner_id);
          const ids = [...new Set((gi.waba_ids || []).map((x) => String(x).replace(/\D/g, "")).filter(Boolean))];
          if (!ownerId || !ids.length) continue;
          const name = str(gi.owner_name).slice(0, 60) || `BM ${ownerId}`;
          const existing = (await listConnections()).find((c) => c.business_id === ownerId && c.id !== src.id) || null;
          let connId: number;
          if (existing) {
            const merged = [...new Set([...(existing.waba_ids || "").split(",").map((x) => x.trim()).filter(Boolean), ...ids])].join(",");
            // a conexão que já existe mantém o token dela (se vier de outra origem, "Mudar de BM" é que a transfere)
            await query(
              `update connections set waba_ids = $2, token = case when source_connection_id = $3 then $4 else token end,
                 app_id = case when source_connection_id = $3 then $5 else app_id end, app_secret = case when source_connection_id = $3 then $6 else app_secret end,
                 updated_at = now() where id = $1`,
              [existing.id, merged, src.id, seal(src.token), src.app_id, seal(src.app_secret)],
            );
            connId = existing.id;
          } else {
            const [row] = await query<{ id: number }>(
              `insert into connections (name, visibility, business_id, business_name, token, app_id, app_secret, waba_ids, source_connection_id, created_by) values ($1, $2, $3, $1, $4, $5, $6, $7, $8, $9) returning id`,
              [name, visibility, ownerId, seal(src.token), src.app_id, seal(src.app_secret), ids.join(","), src.id, user.id],
            );
            connId = row.id;
          }
          // as contas escolhidas passam a pertencer a esta conexão (decisão explícita do Master), mesmo que a BM principal já as tivesse trazido
          await query("update wabas set connection_id = $1, updated_at = now() where id = any($2::text[])", [connId, ids]);
          touched.push(connId);
          results.push({ owner: name, id: connId, created: !existing, wabas: ids.length });
        }
        forgetConnectionCache();
        let sync: { ok: boolean; log: LogLine[] } | null = null;
        if (b.sync !== false && touched.length) {
          const out = await runSync(s, Math.min(Math.max(Number(b.days) || 7, 1), 90), { connectionIds: touched });
          sync = { ok: out.ok, log: out.log.filter((l) => !l.conn || touched.includes(l.conn)) };
        }
        return NextResponse.json({ ok: true, results, sync });
      }

      default:
        return bad("Ação inválida");
    }
  } catch (e: any) {
    return bad(e?.message || "Falhou", e?.code === "23505" ? 409 : 400);
  } finally {
    clearScopeCache(); // empresas, números e conexões mudam o que cada usuário enxerga
  }
}
