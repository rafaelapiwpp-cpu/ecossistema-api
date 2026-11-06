// Configurações → Empresas (portal de clientes): empresas com marca própria, números que cada uma atende,
// usuários-cliente (login, departamento, números e funis que veem), funis/etapas, departamentos e etiquetas da empresa.
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { canSee, clearScopeCache, getScope } from "@/lib/access";
import { isEmail } from "@/lib/mail";
import { cleanDefaults, FALLBACK_DEFAULTS, FEATURES, HEX_RE, RESERVED_SLUGS as RESERVED, SLUG_RE, slugify, type CompanyDefaults } from "@/lib/companies";

export const dynamic = "force-dynamic";

/** Números que a equipe logada pode ver (para o seletor), com a BM de cada um. */
async function visibleNumbers(user: { id?: number; role: string; company_id?: number | null }) {
  const scope = await getScope(user);
  const args: any[] = [];
  const where = scope.all ? "" : (args.push(scope.wabas), `where p.waba_id = any($1::text[])`);
  return query(
    `select p.id, p.waba_id, p.display_phone_number, p.verified_name, p.label, p.quality_rating, w.name as waba_name, c.id as connection_id, c.name as connection_name
     from phone_numbers p left join wabas w on w.id = p.waba_id left join connections c on c.id = w.connection_id ${where}
     order by c.name nulls last, w.name, p.display_phone_number`, args);
}

async function companyPhones(companyId: number) {
  return (await query<{ phone_number_id: string }>("select phone_number_id from company_phones where company_id = $1", [companyId])).map((r) => r.phone_number_id);
}

/** Depois de mudar os números da empresa: conversas e contatos desses números passam a ser dela (e os que saíram deixam de ser). */
async function restamp(companyId: number, phones: string[]) {
  await query("update conversations set company_id = $1 where phone_number_id = any($2::text[]) and company_id is distinct from $1", [companyId, phones]);
  await query("update conversations set company_id = null where company_id = $1 and not (phone_number_id = any($2::text[]))", [companyId, phones]);
  await query(`update contacts k set company_id = $1 where k.company_id is null and exists (select 1 from conversations c where c.contact_id = k.id and c.company_id = $1)`, [companyId]);
}

/** Padrões para empresas novas (Configurações → Empresas); sem nada salvo, os de fábrica. */
async function loadDefaults(): Promise<CompanyDefaults> {
  try {
    const [row] = await query<{ company_defaults: any }>("select company_defaults from settings where id = 1");
    return row?.company_defaults ? cleanDefaults(row.company_defaults) : FALLBACK_DEFAULTS;
  } catch { return FALLBACK_DEFAULTS; }
}

/** Valida os dados da empresa (cadastro novo ou edição). Devolve o erro em português ou os campos limpos. */
function cleanCompany(b: any): { error: string; ok?: undefined } | { ok: { name: string; slug: string; primary: string; secondary: string | null; logo: string | null; tagline: string | null }; error?: undefined } {
  const name = String(b.name || "").trim();
  const slug = slugify(String(b.slug || name));
  const primary = HEX_RE.test(String(b.primary_color || "")) ? String(b.primary_color).toLowerCase() : "#6b3fe4";
  const secondary = HEX_RE.test(String(b.secondary_color || "")) ? String(b.secondary_color).toLowerCase() : null;
  const logo = String(b.logo_url || "").trim() || null;
  if (!name) return { error: "Nome obrigatório" };
  if (!SLUG_RE.test(slug) || RESERVED.has(slug)) return { error: "Endereço inválido: use de 3 a 40 letras minúsculas, números ou hífen (e não um nome reservado)" };
  if (logo && !/^(https?:\/\/|data:image\/(png|jpeg|webp|svg\+xml);base64,)/.test(logo)) return { error: "Logo: use um endereço https ou envie um arquivo PNG/JPG/WEBP" };
  if (logo && logo.length > 400_000) return { error: "Logo muito grande (máx. ~300 KB)" };
  const tagline = String(b.tagline || "").trim().slice(0, 80) || null;
  return { ok: { name, slug, primary, secondary, logo, tagline } };
}

/** Cria a empresa já com o que toda empresa nova recebe: funil padrão, respostas rápidas e departamentos dos padrões. */
async function createCompany(c: { name: string; slug: string; primary: string; secondary: string | null; logo: string | null; tagline: string | null }) {
  const d = await loadDefaults();
  const [row] = await query<{ id: number }>("insert into companies (name, slug, primary_color, secondary_color, logo_url, tagline) values ($1, $2, $3, $4, $5, $6) returning id", [c.name, c.slug, c.primary, c.secondary, c.logo, c.tagline]);
  const [p] = await query<{ id: number }>("insert into pipelines (company_id, name, position, auto_add) values ($1, 'Funil de vendas', 0, true) returning id", [row.id]);
  for (let i = 0; i < d.stages.length; i++) await query("insert into pipeline_stages (pipeline_id, name, color, position, kind) values ($1, $2, $3, $4, $5)", [p.id, d.stages[i].name, d.stages[i].color, i, d.stages[i].kind]);
  for (const q of d.quick_replies) await query("insert into quick_replies (title, body, shortcut, company_id) values ($1, $2, $3, $4)", [q.title, q.body, q.shortcut || null, row.id]);
  for (const name of d.departments) await query("insert into departments (name, company_id) values ($1, $2) on conflict do nothing", [name, row.id]);
  return row.id;
}

/** Números que a empresa atende (um número atende uma empresa só) — e re-carimba conversas/contatos. */
async function setCompanyPhones(user: { role: string }, companyId: number, raw: unknown[]) {
  const ids = [...new Set(raw.map((x) => String(x)))];
  const scope = await getScope(user);
  const rows = await query<{ id: string; waba_id: string }>("select id, waba_id from phone_numbers where id = any($1::text[])", [ids]);
  if (rows.length !== ids.length || rows.some((p) => !canSee(scope, p.waba_id))) return "Algum número não está disponível para você";
  await query("delete from company_phones where company_id = $1 and not (phone_number_id = any($2::text[]))", [companyId, ids]);
  await query("delete from company_phones where phone_number_id = any($2::text[]) and company_id <> $1", [companyId, ids]);
  for (const id of ids) await query("insert into company_phones (company_id, phone_number_id) values ($1, $2) on conflict do nothing", [companyId, id]);
  await restamp(companyId, ids);
  return null;
}

/** Usuário-cliente novo (nome, e-mail = login, senha ≥ 8, departamento opcional). Devolve o erro ou o id. */
async function createClientUser(companyId: number, b: any): Promise<{ error: string } | { id: number }> {
  const name = String(b.name || "").trim(), email = String(b.email || "").trim().toLowerCase();
  if (!name || !email) return { error: "Nome e e-mail do usuário são obrigatórios" };
  if (!isEmail(email)) return { error: "E-mail do usuário inválido" };
  if (!b.password || String(b.password).length < 8) return { error: "Senha do usuário com no mínimo 8 caracteres" };
  if ((await query("select 1 from users where lower(email) = $1", [email])).length) return { error: "Já existe um usuário com este e-mail" };
  const dep = b.department_id ? Number(b.department_id) : null;
  const [u] = await query<{ id: number }>(
    "insert into users (name, email, password_hash, role, department_id, company_id, recovery_email) values ($1, $2, $3, 'cliente', $4, $5, $2) returning id",
    [name, email, hashPassword(String(b.password)), dep, companyId]);
  return { id: u.id };
}

export async function GET() {
  const r = await requireSession({ admin: true });
  if ("res" in r) return r.res;
  const [companies, phones, users, pipelines, stages, departments, tags, numbers, autoTags] = await Promise.all([
    query("select * from companies order by active desc, name"),
    query("select company_id, phone_number_id from company_phones"),
    query(`select u.id, u.name, u.email, u.department_id, u.active, u.company_id, u.last_login_at,
             coalesce((select json_agg(phone_number_id) from user_phones where user_id = u.id), '[]'::json) as phone_ids,
             coalesce((select json_agg(pipeline_id) from user_pipelines where user_id = u.id), '[]'::json) as pipeline_ids
           from users u where u.role = 'cliente' order by u.name`),
    query("select * from pipelines order by company_id, position, id"),
    query("select * from pipeline_stages order by pipeline_id, position, id"),
    query("select * from departments where company_id is not null order by name"),
    query("select * from tags where company_id is not null order by name"),
    visibleNumbers(r.user),
    query("select company_id, tag_id from company_auto_tags"),
  ]);
  const phoneOwner: Record<string, number> = {};
  for (const p of phones) phoneOwner[p.phone_number_id] = p.company_id;
  const out = companies.map((c: any) => ({
    ...c,
    phone_ids: phones.filter((p: any) => p.company_id === c.id).map((p: any) => p.phone_number_id),
    users: users.filter((u: any) => u.company_id === c.id),
    pipelines: pipelines.filter((p: any) => p.company_id === c.id).map((p: any) => ({ ...p, stages: stages.filter((s: any) => s.pipeline_id === p.id) })),
    departments: departments.filter((d: any) => d.company_id === c.id),
    tags: tags.filter((t: any) => t.company_id === c.id),
    auto_tag_ids: autoTags.filter((t: any) => t.company_id === c.id).map((t: any) => t.tag_id),
  }));
  return NextResponse.json({ companies: out, numbers, phoneOwner, defaults: await loadDefaults() });
}

export async function POST(req: Request) {
  const r = await requireSession({ admin: true });
  if ("res" in r) return r.res;
  const b = await req.json().catch(() => ({}));
  const bad = (m: string, code = 400) => NextResponse.json({ error: m }, { status: code });
  const company = async (id: any) => (await query<{ id: number; slug: string }>("select id, slug from companies where id = $1", [Number(id)]))[0] || null;

  try {
    switch (b.action) {
      case "company_save": {
        const v = cleanCompany(b); if (v.error || !v.ok) return bad(v.error || "Dados inválidos");
        const c = v.ok;
        if (b.id) {
          await query("update companies set name = $2, slug = $3, primary_color = $4, secondary_color = $5, logo_url = $6, tagline = $7, updated_at = now() where id = $1", [Number(b.id), c.name, c.slug, c.primary, c.secondary, c.logo, c.tagline]);
          return NextResponse.json({ ok: true, id: Number(b.id), slug: c.slug });
        }
        const id = await createCompany(c);
        return NextResponse.json({ ok: true, id, slug: c.slug });
      }
      case "company_create": {
        // cadastro completo em uma tela: empresa + números + departamentos + primeiro usuário (os padrões entram sozinhos)
        const v = cleanCompany(b); if (v.error || !v.ok) return bad(v.error || "Dados inválidos");
        if ((await query("select 1 from companies where slug = $1", [v.ok.slug])).length) return bad("Já existe uma empresa com este endereço");
        const u = b.user || {};
        if (u.name || u.email || u.password) { // o 1º usuário é opcional, mas se começou tem que estar completo
          if (!String(u.name || "").trim() || !String(u.email || "").trim()) return bad("Nome e e-mail do usuário são obrigatórios");
          if (!isEmail(String(u.email).trim().toLowerCase())) return bad("E-mail do usuário inválido");
          if (!u.password || String(u.password).length < 8) return bad("Senha do usuário com no mínimo 8 caracteres");
          if ((await query("select 1 from users where lower(email) = $1", [String(u.email).trim().toLowerCase()])).length) return bad("Já existe um usuário com este e-mail");
        }
        const id = await createCompany(v.ok);
        const phoneErr = Array.isArray(b.phone_ids) && b.phone_ids.length ? await setCompanyPhones(r.user, id, b.phone_ids) : null;
        const deps = [...new Set(((b.departments || []) as unknown[]).map((x) => String(x || "").trim().slice(0, 40)).filter(Boolean))];
        for (const name of deps) await query("insert into departments (name, company_id) values ($1, $2) on conflict do nothing", [name, id]);
        let userId: number | null = null, userErr: string | null = null;
        if (u.name || u.email || u.password) {
          let dep: number | null = null;
          if (u.department) { const [d] = await query<{ id: number }>("select id from departments where company_id = $1 and lower(name) = lower($2)", [id, String(u.department).trim()]); dep = d?.id || null; }
          const cu = await createClientUser(id, { ...u, department_id: dep });
          if ("error" in cu) userErr = cu.error; else userId = cu.id;
        }
        clearScopeCache();
        return NextResponse.json({ ok: true, id, slug: v.ok.slug, user_id: userId, warnings: [phoneErr, userErr].filter(Boolean) });
      }
      case "defaults_save": {
        const d = cleanDefaults(b.defaults);
        await query("update settings set company_defaults = $1::jsonb where id = 1", [d]);
        return NextResponse.json({ ok: true, defaults: d });
      }
      case "company_defaults": {
        // automações: departamento padrão das conversas novas e etiquetas automáticas dos leads novos
        const c = await company(b.id); if (!c) return bad("Empresa não encontrada", 404);
        const dep = b.default_department_id ? Number(b.default_department_id) : null;
        if (dep && !(await query("select 1 from departments where id = $1 and company_id = $2", [dep, c.id])).length) return bad("Departamento não é desta empresa");
        const tagIds = [...new Set(((b.auto_tag_ids || []) as unknown[]).map(Number).filter(Number.isInteger))];
        const own = (await query<{ id: number }>("select id from tags where company_id = $1 and id = any($2::int[])", [c.id, tagIds])).map((t) => t.id);
        await query("update companies set default_department_id = $2, updated_at = now() where id = $1", [c.id, dep]);
        await query("delete from company_auto_tags where company_id = $1", [c.id]);
        for (const t of own) await query("insert into company_auto_tags (company_id, tag_id) values ($1, $2) on conflict do nothing", [c.id, t]);
        return NextResponse.json({ ok: true });
      }
      case "company_features": {
        // recursos liga/desliga (só as chaves conhecidas; o resto é ignorado)
        const c = await company(b.id); if (!c) return bad("Empresa não encontrada", 404);
        const f: Record<string, boolean> = {};
        for (const x of FEATURES) if (b.features?.[x.key] === true) f[x.key] = true;
        await query("update companies set features = $2::jsonb, updated_at = now() where id = $1", [c.id, f]); // objeto: o driver já serializa como JSON
        clearScopeCache();
        return NextResponse.json({ ok: true, features: f });
      }
      case "company_active": {
        if (!(await company(b.id))) return bad("Empresa não encontrada", 404);
        await query("update companies set active = $2, updated_at = now() where id = $1", [Number(b.id), Boolean(b.active)]);
        return NextResponse.json({ ok: true });
      }
      case "company_phones": {
        const c = await company(b.id); if (!c) return bad("Empresa não encontrada", 404);
        const e = await setCompanyPhones(r.user, c.id, (b.phone_ids || []) as unknown[]);
        if (e) return bad(e);
        return NextResponse.json({ ok: true });
      }
      case "user_save": {
        const c = await company(b.company_id); if (!c) return bad("Empresa não encontrada", 404);
        const name = String(b.name || "").trim(), email = String(b.email || "").trim().toLowerCase();
        if (!name || !email) return bad("Nome e e-mail são obrigatórios");
        if (!isEmail(email)) return bad("E-mail inválido");
        const dep = b.department_id ? Number(b.department_id) : null;
        if (dep && !(await query("select 1 from departments where id = $1 and company_id = $2", [dep, c.id])).length) return bad("Departamento não é desta empresa");
        const allowedPhones = new Set(await companyPhones(c.id));
        const phoneIds: string[] = [...new Set((b.phone_ids || []).map(String))].filter((p) => allowedPhones.has(p as string)) as string[];
        const pipes = (await query<{ id: number }>("select id from pipelines where company_id = $1", [c.id])).map((p) => p.id);
        const pipeIds: number[] = [...new Set((b.pipeline_ids || []).map(Number))].filter((p) => pipes.includes(p as number)) as number[];
        let id = Number(b.id || 0);
        if (id) {
          const [u] = await query<{ role: string; company_id: number | null }>("select role, company_id from users where id = $1", [id]);
          if (!u || u.role !== "cliente" || u.company_id !== c.id) return bad("Usuário não encontrado", 404);
          await query("update users set name = $2, email = $3, department_id = $4, recovery_email = $3 where id = $1", [id, name, email, dep]);
          if (b.password) {
            if (String(b.password).length < 8) return bad("Senha com no mínimo 8 caracteres");
            await query("update users set password_hash = $2 where id = $1", [id, hashPassword(String(b.password))]);
          }
        } else {
          if (!b.password || String(b.password).length < 8) return bad("Senha com no mínimo 8 caracteres");
          const [u] = await query<{ id: number }>(
            "insert into users (name, email, password_hash, role, department_id, company_id, recovery_email) values ($1, $2, $3, 'cliente', $4, $5, $2) returning id",
            [name, email, hashPassword(String(b.password)), dep, c.id]);
          id = u.id;
        }
        await query("delete from user_phones where user_id = $1", [id]);
        for (const p of phoneIds) await query("insert into user_phones (user_id, phone_number_id) values ($1, $2)", [id, p]);
        await query("delete from user_pipelines where user_id = $1", [id]);
        for (const p of pipeIds) await query("insert into user_pipelines (user_id, pipeline_id) values ($1, $2)", [id, p]);
        return NextResponse.json({ ok: true, id });
      }
      case "user_active": {
        const [u] = await query<{ role: string }>("select role from users where id = $1", [Number(b.id)]);
        if (!u || u.role !== "cliente") return bad("Usuário não encontrado", 404);
        await query("update users set active = $2 where id = $1", [Number(b.id), Boolean(b.active)]);
        return NextResponse.json({ ok: true });
      }
      case "pipeline_save": {
        const c = await company(b.company_id); if (!c) return bad("Empresa não encontrada", 404);
        const name = String(b.name || "").trim(); if (!name) return bad("Nome do funil obrigatório");
        const stages: { id?: number; name: string; color: string | null; kind: string }[] = (b.stages || [])
          .map((s: any) => ({ id: s.id ? Number(s.id) : undefined, name: String(s.name || "").trim().slice(0, 40), color: HEX_RE.test(String(s.color || "")) ? String(s.color).toLowerCase() : null, kind: ["open", "won", "lost"].includes(s.kind) ? s.kind : "open" }))
          .filter((s: any) => s.name);
        if (!stages.length) return bad("Crie pelo menos uma etapa");
        let pid = Number(b.id || 0);
        if (pid) {
          const [p] = await query("select 1 from pipelines where id = $1 and company_id = $2", [pid, c.id]);
          if (!p) return bad("Funil não encontrado", 404);
          await query("update pipelines set name = $2, auto_add = $3 where id = $1", [pid, name, b.auto_add !== false]);
        } else {
          const [p] = await query<{ id: number }>("insert into pipelines (company_id, name, position, auto_add) values ($1, $2, (select coalesce(max(position) + 1, 0) from pipelines where company_id = $1), $3) returning id", [c.id, name, b.auto_add !== false]);
          pid = p.id;
        }
        const existing = (await query<{ id: number }>("select id from pipeline_stages where pipeline_id = $1", [pid])).map((s) => s.id);
        const keep: number[] = [];
        for (let i = 0; i < stages.length; i++) {
          const st = stages[i];
          if (st.id && existing.includes(st.id)) {
            await query("update pipeline_stages set name = $2, color = $3, position = $4, kind = $5 where id = $1", [st.id, st.name, st.color, i, st.kind]);
            keep.push(st.id);
          } else {
            const [ns] = await query<{ id: number }>("insert into pipeline_stages (pipeline_id, name, color, position, kind) values ($1, $2, $3, $4, $5) returning id", [pid, st.name, st.color, i, st.kind]);
            keep.push(ns.id);
          }
        }
        const removed = existing.filter((id) => !keep.includes(id));
        if (removed.length) { // cartões das etapas apagadas vão para a primeira etapa
          await query("update pipeline_cards set stage_id = $2, moved_at = now() where pipeline_id = $1 and stage_id = any($3::int[])", [pid, keep[0], removed]);
          await query("delete from pipeline_stages where id = any($1::int[])", [removed]);
        }
        return NextResponse.json({ ok: true, id: pid });
      }
      case "pipeline_delete": {
        const [p] = await query<{ id: number }>("select id from pipelines where id = $1", [Number(b.id)]);
        if (!p) return bad("Funil não encontrado", 404);
        await query("delete from pipeline_cards where pipeline_id = $1", [p.id]);
        await query("delete from pipeline_stages where pipeline_id = $1", [p.id]);
        await query("delete from user_pipelines where pipeline_id = $1", [p.id]);
        await query("delete from pipelines where id = $1", [p.id]);
        return NextResponse.json({ ok: true });
      }
      case "department_save": {
        const c = await company(b.company_id); if (!c) return bad("Empresa não encontrada", 404);
        const name = String(b.name || "").trim(); if (!name) return bad("Nome obrigatório");
        if (b.id) await query("update departments set name = $2, color = $3 where id = $1 and company_id = $4", [Number(b.id), name, b.color || null, c.id]);
        else await query("insert into departments (name, color, company_id) values ($1, $2, $3) on conflict do nothing", [name, b.color || null, c.id]);
        return NextResponse.json({ ok: true });
      }
      case "department_delete": {
        const [d] = await query<{ company_id: number | null }>("select company_id from departments where id = $1", [Number(b.id)]);
        if (!d?.company_id) return bad("Departamento não encontrado", 404);
        await query("update conversations set department_id = null where department_id = $1", [Number(b.id)]);
        await query("update contacts set department_id = null where department_id = $1", [Number(b.id)]);
        await query("update companies set default_department_id = null where default_department_id = $1", [Number(b.id)]);
        await query("update users set department_id = null where department_id = $1", [Number(b.id)]);
        await query("delete from departments where id = $1", [Number(b.id)]);
        return NextResponse.json({ ok: true });
      }
      case "tag_save": {
        const c = await company(b.company_id); if (!c) return bad("Empresa não encontrada", 404);
        const name = String(b.name || "").trim(); if (!name) return bad("Nome obrigatório");
        if (b.id) await query("update tags set name = $2, color = $3 where id = $1 and company_id = $4", [Number(b.id), name, b.color || null, c.id]);
        else await query("insert into tags (name, color, company_id) values ($1, $2, $3) on conflict do nothing", [name, b.color || null, c.id]);
        return NextResponse.json({ ok: true });
      }
      case "tag_delete": {
        const [t] = await query<{ company_id: number | null }>("select company_id from tags where id = $1", [Number(b.id)]);
        if (!t?.company_id) return bad("Etiqueta não encontrada", 404);
        await query("delete from contact_tags where tag_id = $1", [Number(b.id)]);
        await query("delete from company_auto_tags where tag_id = $1", [Number(b.id)]);
        await query("delete from tags where id = $1", [Number(b.id)]);
        return NextResponse.json({ ok: true });
      }
      default:
        return bad("Ação inválida");
    }
  } catch (e: any) {
    if (e?.code === "23505") return bad("Já existe um registro com esse nome, endereço ou e-mail");
    return bad(e.message || "Falha", 500);
  } finally {
    clearScopeCache(); // empresas, números e conexões mudam o que cada usuário enxerga
  }
}
