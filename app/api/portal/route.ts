// Portal de clientes: o que o próprio usuário-cliente vê e gerencia na empresa dele.
// GET  ?summary=1  → Início (números atendidos com foto, conversas por situação, mensagens de hoje, funil, fila)
// GET  ?settings=1 → Ajustes (empresa, números, departamentos, automações)
// POST ações: my_password, my_profile, defaults_save, tag_save/tag_delete, quick_save/quick_delete, department_save/department_delete
// (Equipe interna com acesso de gestor+ também pode usar, informando a empresa pelo slug.)
import { NextResponse, after } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { companyBySlug, getScope, type Company, type Scope } from "@/lib/access";
import { isManagerRole } from "@/lib/roles";
import { graphForPhone } from "@/lib/connections";
import { logoSrc } from "@/lib/companies";
import type { Settings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";
const TODAY = `(((now() at time zone '${TZ}')::date)::timestamp at time zone '${TZ}')`;

/** Empresa do usuário-cliente — ou, para a equipe (gestor+), a empresa informada pelo slug. */
async function resolveCompany(user: { role: string }, scope: Scope, slug: string | null): Promise<Company | null> {
  if (scope.company) return scope.company;
  if (isManagerRole(user.role) && slug) return companyBySlug(slug);
  return null;
}

/** Números que este usuário atende (os dele ou, sem restrição, todos da empresa). */
async function phonesOf(scope: Scope, companyId: number) {
  if (scope.phones?.length) return scope.phones;
  return (await query<{ phone_number_id: string }>("select phone_number_id from company_phones where company_id = $1", [companyId])).map((x) => x.phone_number_id);
}

// Foto de perfil dos números: fica guardada no banco e é renovada em segundo plano (a URL da Meta expira),
// então o Início nunca espera a Meta responder. Sem foto ainda = iniciais até a próxima atualização.
const PIC_REFRESH_MS = 6 * 3600 * 1000;
const picBusy = new Set<string>();
const picStale = (at: string | Date | null) => !at || Date.now() - new Date(at).getTime() > PIC_REFRESH_MS;
async function refreshPicture(s: Settings, pnid: string) {
  if (picBusy.has(pnid)) return;
  picBusy.add(pnid);
  try {
    const g = await graphForPhone(s, pnid);
    const out = await Promise.race([
      g.get<{ data: { profile_picture_url?: string }[] }>(`${pnid}/whatsapp_business_profile`, { fields: "profile_picture_url" }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ]);
    await query("update phone_numbers set profile_picture_url = $2, profile_picture_at = now() where id = $1", [pnid, out.data?.[0]?.profile_picture_url || null]);
  } catch {
    // falhou (rede, token): mantém a foto que já temos e tenta de novo em ~1 h
    await query("update phone_numbers set profile_picture_at = now() - interval '5 hours' where id = $1", [pnid]).catch(() => {});
  } finally { picBusy.delete(pnid); }
}

export async function GET(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const p = new URL(req.url).searchParams;
  const scope = await getScope(r.user);
  const company = await resolveCompany(r.user, scope, p.get("company"));
  if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  const phones = await phonesOf(scope, company.id);
  const brand = { id: company.id, name: company.name, slug: company.slug, tagline: company.tagline || null, logo: logoSrc(company), primary_color: company.primary_color, secondary_color: company.secondary_color };

  if (p.get("settings")) {
    const [departments, tags, autoTags, numbers, users, quickReplies] = await Promise.all([
      query("select id, name, color from departments where company_id = $1 order by name", [company.id]),
      query("select id, name, color from tags where company_id = $1 order by name", [company.id]),
      query<{ tag_id: number }>("select tag_id from company_auto_tags where company_id = $1", [company.id]),
      query("select p.id, p.display_phone_number, p.verified_name, p.label, p.quality_rating from phone_numbers p where p.id = any($1::text[]) order by p.display_phone_number", [phones]),
      query("select id, name, department_id, active from users where company_id = $1 and active order by name", [company.id]),
      query("select id, title, body, shortcut from quick_replies where company_id = $1 order by title", [company.id]),
    ]);
    return NextResponse.json({ company: brand, departments, tags, auto_tag_ids: autoTags.map((t) => t.tag_id), default_department_id: company.default_department_id ?? null, numbers, users, quickReplies, me: { id: r.user.id, name: r.user.name, email: r.user.email, department_id: r.user.department_id ?? null } });
  }

  // ---- Início ----
  const args: any[] = [phones];
  const where = ["c.phone_number_id = any($1::text[])"];
  if (r.user.role === "cliente" && r.user.department_id) {
    args.push(r.user.department_id);
    where.push(`(c.department_id = $${args.length} or c.department_id is null or c.assigned_user_id = ${Number(r.user.id)})`);
  }
  const W = where.join(" and ");
  const WEEK = `(${TODAY} - interval '6 days')`; // últimos 7 dias, hoje incluído
  const DAY = (col: string) => `to_char((${col} at time zone '${TZ}')::date, 'YYYY-MM-DD')`;
  const [byStatus, byPhone, today, closedToday, waiting, numbers, pipe, msgDays, closedDays, startedDays, team, metaSent] = await Promise.all([
    query<{ status: string; n: string; unread: string }>(`select c.status, count(*)::text as n, coalesce(sum(c.unread_count), 0)::text as unread from conversations c where ${W} group by c.status`, args),
    query<{ phone_number_id: string; status: string; n: string }>(`select c.phone_number_id, c.status, count(*)::text as n from conversations c where ${W} group by c.phone_number_id, c.status`, args),
    query<{ direction: string; n: string }>(`select m.direction, count(*)::text as n from messages m where m.phone_number_id = any($1::text[]) and m.ts >= ${TODAY} group by m.direction`, [phones]),
    query<{ n: string }>(`select count(*)::text as n from conversations c where ${W} and c.status = 'closed' and c.closed_at >= ${TODAY}`, args),
    query(`select c.id, c.last_preview, c.last_message_at, c.unread_count, c.status, k.name as contact_name, k.phone as contact_phone, d.name as department_name, d.color as department_color
           from conversations c join contacts k on k.id = c.contact_id left join departments d on d.id = c.department_id
           where ${W} and c.status in ('open', 'pending') order by c.unread_count desc, c.last_message_at desc nulls last limit 6`, args),
    query<{ id: string; display_phone_number: string; verified_name: string | null; label: string | null; quality_rating: string | null; profile_picture_url: string | null; profile_picture_at: string | null }>("select p.id, p.display_phone_number, p.verified_name, p.label, p.quality_rating, p.profile_picture_url, p.profile_picture_at from phone_numbers p where p.id = any($1::text[]) order by p.display_phone_number", [phones]),
    firstPipeline(scope, r.user.id, company.id),
    // atividade dos últimos 7 dias (gráfico do Início)
    query<{ day: string; direction: string; n: string }>(`select ${DAY("m.ts")} as day, m.direction, count(*)::text as n from messages m where m.phone_number_id = any($1::text[]) and m.ts >= ${WEEK} group by 1, 2`, [phones]),
    query<{ day: string; n: string }>(`select ${DAY("c.closed_at")} as day, count(*)::text as n from conversations c where ${W} and c.status = 'closed' and c.closed_at >= ${WEEK} group by 1`, args),
    query<{ day: string; n: string }>(`select ${DAY("c.created_at")} as day, count(*)::text as n from conversations c where ${W} and c.created_at >= ${WEEK} group by 1`, args),
    query<{ n: string }>("select count(*)::text as n from users where company_id = $1 and active", [company.id]),
    // envios que a própria Meta contou por número e dia (sincronização): cobre disparos feitos por outro sistema
    // ou antes de o webhook apontar para cá, que não viraram mensagem aqui
    query<{ day: string; n: string }>(`select to_char(d.day, 'YYYY-MM-DD') as day, sum(d.sent)::text as n
       from daily_messages d join phone_numbers p on p.waba_id = d.waba_id and p.phone_digits = d.phone_digits
       where p.id = any($1::text[]) and d.day >= (${WEEK} at time zone '${TZ}')::date group by 1`, [phones]),
  ]);
  const old = numbers.filter((n) => picStale(n.profile_picture_at)).map((n) => n.id);
  if (old.length) after(async () => { for (const id of old) await refreshPicture(r.s, id); });
  const counts: Record<string, number> = { open: 0, pending: 0, closed: 0 };
  let unread = 0;
  for (const s of byStatus) { counts[s.status] = Number(s.n); if (s.status !== "closed") unread += Number(s.unread); }
  const perPhone: Record<string, { open: number; pending: number; closed: number }> = {};
  for (const x of byPhone) { (perPhone[x.phone_number_id] ||= { open: 0, pending: 0, closed: 0 })[x.status as "open"] = Number(x.n); }
  const msgs = { in: 0, out: 0 };
  for (const t of today) msgs[t.direction as "in" | "out"] = Number(t.n);
  // série dos 7 dias, sempre com os 7 (zeros onde não houve nada), do mais antigo para hoje
  const series: { day: string; in: number; out: number; closed: number; started: number }[] = [];
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
  for (let i = 6; i >= 0; i--) series.push({ day: dayFmt.format(new Date(Date.now() - i * 86400000)), in: 0, out: 0, closed: 0, started: 0 });
  const at = (day: string) => series.find((s) => s.day === day);
  for (const x of msgDays) { const s = at(x.day); if (s) s[x.direction === "out" ? "out" : "in"] += Number(x.n); }
  for (const x of closedDays) { const s = at(x.day); if (s) s.closed = Number(x.n); }
  for (const x of startedDays) { const s = at(x.day); if (s) s.started = Number(x.n); }
  // enviadas = o maior entre o que passou por aqui e o que a Meta contou no dia
  for (const x of metaSent) { const s = at(x.day); if (s) s.out = Math.max(s.out, Number(x.n)); }
  msgs.out = Math.max(msgs.out, series[series.length - 1].out);
  return NextResponse.json({
    company: brand,
    me: { id: r.user.id, name: r.user.name, role: r.user.role },
    counts: { ...counts, unread, closed_today: Number(closedToday[0]?.n || 0), in_today: msgs.in, out_today: msgs.out },
    numbers: numbers.map(({ profile_picture_url, profile_picture_at, ...n }) => ({ ...n, picture: profile_picture_url, ...(perPhone[n.id] || { open: 0, pending: 0, closed: 0 }) })),
    waiting,
    funnel: pipe,
    series,
    team: Number(team[0]?.n || 0),
  });
}

/** Primeiro funil que o usuário vê, com a quantidade de leads por etapa. */
async function firstPipeline(scope: Scope, userId: number, companyId: number) {
  const mine = scope.client ? (await query<{ pipeline_id: number }>("select pipeline_id from user_pipelines where user_id = $1", [userId])).map((x) => x.pipeline_id) : [];
  const args: any[] = [companyId];
  let extra = "";
  if (mine.length) { args.push(mine); extra = ` and p.id = any($2::int[])`; }
  const [p] = await query<{ id: number; name: string }>(`select p.id, p.name from pipelines p where p.company_id = $1${extra} order by p.position, p.id limit 1`, args);
  if (!p) return null;
  const stages = await query<{ id: number; name: string; color: string | null; kind: string; n: string; value: string }>(
    `select s.id, s.name, s.color, s.kind, count(pc.contact_id)::text as n, coalesce(sum(pc.value), 0)::text as value from pipeline_stages s left join pipeline_cards pc on pc.stage_id = s.id and pc.pipeline_id = s.pipeline_id
     where s.pipeline_id = $1 group by s.id order by s.position, s.id`, [p.id]);
  const num = (v: string) => Number(v) || 0;
  return {
    id: p.id, name: p.name,
    stages: stages.map((s) => ({ ...s, n: Number(s.n), value: num(s.value) })),
    total: stages.reduce((a, s) => a + Number(s.n), 0),
    // valor em aberto (etapas ainda em andamento) e ganho (etapas de tipo "ganho")
    value_open: stages.filter((s) => s.kind === "open").reduce((a, s) => a + num(s.value), 0),
    value_won: stages.filter((s) => s.kind === "won").reduce((a, s) => a + num(s.value), 0),
  };
}

export async function POST(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const b = await req.json().catch(() => ({}));
  const bad = (m: string, code = 400) => NextResponse.json({ error: m }, { status: code });
  const scope = await getScope(r.user);
  const company = await resolveCompany(r.user, scope, b.company ? String(b.company) : null);
  const companyId = company?.id ?? null;
  try {
    switch (b.action) {
      case "my_password": {
        if (!b.password || String(b.password).length < 8) return bad("Senha com no mínimo 8 caracteres");
        await query("update users set password_hash = $2 where id = $1", [r.user.id, hashPassword(String(b.password))]);
        return NextResponse.json({ ok: true, relogin: true });
      }
      case "my_profile": {
        const name = String(b.name || "").trim().slice(0, 80);
        if (!name) return bad("Informe o seu nome");
        await query("update users set name = $2 where id = $1", [r.user.id, name]);
        return NextResponse.json({ ok: true });
      }
      case "defaults_save": {
        if (!companyId) return bad("Empresa não encontrada", 404);
        const dep = b.default_department_id ? Number(b.default_department_id) : null;
        if (dep && !(await query("select 1 from departments where id = $1 and company_id = $2", [dep, companyId])).length) return bad("Departamento não encontrado");
        const tagIds = [...new Set(((b.auto_tag_ids || []) as unknown[]).map(Number).filter(Number.isInteger))];
        const own = (await query<{ id: number }>("select id from tags where company_id = $1 and id = any($2::int[])", [companyId, tagIds])).map((t) => t.id);
        await query("update companies set default_department_id = $2, updated_at = now() where id = $1", [companyId, dep]);
        await query("delete from company_auto_tags where company_id = $1", [companyId]);
        for (const t of own) await query("insert into company_auto_tags (company_id, tag_id) values ($1, $2) on conflict do nothing", [companyId, t]);
        return NextResponse.json({ ok: true });
      }
      case "tag_save": {
        if (!companyId) return bad("Empresa não encontrada", 404);
        const name = String(b.name || "").trim().slice(0, 40); if (!name) return bad("Nome obrigatório");
        if (b.id) await query("update tags set name = $2, color = $3 where id = $1 and company_id = $4", [Number(b.id), name, b.color || null, companyId]);
        else await query("insert into tags (name, color, company_id) values ($1, $2, $3) on conflict do nothing", [name, b.color || null, companyId]);
        return NextResponse.json({ ok: true });
      }
      case "tag_delete": {
        if (!companyId) return bad("Empresa não encontrada", 404);
        const [t] = await query("select 1 from tags where id = $1 and company_id = $2", [Number(b.id), companyId]);
        if (!t) return bad("Etiqueta não encontrada", 404);
        await query("delete from contact_tags where tag_id = $1", [Number(b.id)]);
        await query("delete from company_auto_tags where tag_id = $1", [Number(b.id)]);
        await query("delete from tags where id = $1", [Number(b.id)]);
        return NextResponse.json({ ok: true });
      }
      case "department_save": {
        if (!companyId) return bad("Empresa não encontrada", 404);
        const name = String(b.name || "").trim().slice(0, 40); if (!name) return bad("Nome obrigatório");
        if (b.id) await query("update departments set name = $2, color = $3 where id = $1 and company_id = $4", [Number(b.id), name, b.color || null, companyId]);
        else await query("insert into departments (name, color, company_id) values ($1, $2, $3) on conflict do nothing", [name, b.color || null, companyId]);
        return NextResponse.json({ ok: true });
      }
      case "department_delete": {
        if (!companyId) return bad("Empresa não encontrada", 404);
        const [d] = await query("select 1 from departments where id = $1 and company_id = $2", [Number(b.id), companyId]);
        if (!d) return bad("Departamento não encontrado", 404);
        await query("update conversations set department_id = null where department_id = $1", [Number(b.id)]);
        await query("update contacts set department_id = null where department_id = $1", [Number(b.id)]);
        await query("update users set department_id = null where department_id = $1", [Number(b.id)]);
        await query("update companies set default_department_id = null where default_department_id = $1", [Number(b.id)]);
        await query("delete from departments where id = $1", [Number(b.id)]);
        return NextResponse.json({ ok: true });
      }
      case "quick_save": {
        if (!companyId) return bad("Empresa não encontrada", 404);
        const title = String(b.title || "").trim().slice(0, 60), body = String(b.body || "").trim().slice(0, 4000);
        if (!title || !body) return bad("Título e texto são obrigatórios");
        const shortcut = String(b.shortcut || "").trim().toLowerCase().replace(/^\/+/, "").replace(/[^a-z0-9_-]/g, "").slice(0, 24) || null;
        if (b.id) await query("update quick_replies set title = $2, body = $3, shortcut = $5 where id = $1 and company_id = $4", [Number(b.id), title, body, companyId, shortcut]);
        else await query("insert into quick_replies (title, body, company_id, shortcut) values ($1, $2, $3, $4)", [title, body, companyId, shortcut]);
        return NextResponse.json({ ok: true });
      }
      case "quick_delete": {
        if (!companyId) return bad("Empresa não encontrada", 404);
        await query("delete from quick_replies where id = $1 and company_id = $2", [Number(b.id), companyId]);
        return NextResponse.json({ ok: true });
      }
      default:
        return bad("Ação inválida");
    }
  } catch (e: any) {
    if (e?.code === "23505") return bad("Já existe um registro com esse nome");
    return bad(e.message || "Falha", 500);
  }
}
