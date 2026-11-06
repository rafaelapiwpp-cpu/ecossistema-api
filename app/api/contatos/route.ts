import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { onlyDigits } from "@/lib/meta";
import { canSee, getScope } from "@/lib/access";
import { isManagerRole } from "@/lib/roles";
import { TAG_COLORS, contactWhere, readFilter, whereSql } from "@/lib/contact-filters";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Até quantos contatos uma ação em massa ("todos do filtro") alcança de uma vez. */
const BULK_MAX = 100000;

/** Lista de contatos com filtros (os mesmos da exportação e das ações em massa). */
export async function GET(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const p = new URL(req.url).searchParams;
  const scope = await getScope(r.user);
  const args: any[] = [];
  const W = whereSql(contactWhere(scope, readFilter(p), args));
  const limit = Math.min(Number(p.get("limit") || 50), 500);
  const page = Math.max(Number(p.get("page") || 1), 1);
  const [{ n }] = await query<{ n: string }>(`select count(*)::text as n from contacts k ${W}`, args);
  args.push(limit, (page - 1) * limit);
  const rows = await query(
    `select k.*, d.name as department_name, w.name as waba_name,
            coalesce((select json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name) from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = k.id), '[]'::json) as tags,
            ${scope.client ? "'[]'::json" : "coalesce((select json_agg(json_build_object('id', l.id, 'name', l.name) order by l.name) from list_contacts lc join lists l on l.id = lc.list_id where lc.contact_id = k.id), '[]'::json)"} as lists,
            (select c.id from conversations c where c.contact_id = k.id order by c.last_message_at desc nulls last limit 1) as conversation_id
     from contacts k left join departments d on d.id = k.department_id left join wabas w on w.id = k.waba_id
     ${W} order by k.updated_at desc, k.id desc limit $${args.length - 1} offset $${args.length}`,
    args,
  );
  return NextResponse.json({ rows, total: Number(n), page, limit });
}

/** Cria/edita um contato; cria tag, lista ou departamento na hora; ações em massa (por seleção ou pelo filtro inteiro). */
export async function POST(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const b = await req.json().catch(() => ({}));
  const bad = (m: string, status = 400) => NextResponse.json({ error: m }, { status });
  const scope = await getScope(r.user);
  const company = scope.company?.id ?? null;
  // portal: departamentos e etiquetas só da própria empresa
  const ownedBy = async (table: "departments" | "tags", id: number | null) => {
    if (id == null) return true;
    const [x] = await query<{ company_id: number | null }>(`select company_id from ${table} where id = $1`, [id]);
    if (!x) return false;
    return company ? x.company_id === company : true;
  };
  try {
    if (b.action === "save") {
      const phone = onlyDigits(b.phone);
      if (phone.length < 10) return bad("Telefone inválido (use DDI + DDD + número)");
      if (!b.waba_id) return bad("Escolha a conta (WABA)");
      if (!canSee(scope, String(b.waba_id))) return bad("Conta não encontrada");
      const dep = b.department_id ? Number(b.department_id) : null;
      if (!(await ownedBy("departments", dep))) return bad("Departamento não encontrado");
      if (company) { // portal: só mexe em contato da própria empresa (ou ainda sem empresa, que passa a ser dela)
        const [ex] = await query<{ company_id: number | null }>("select company_id from contacts where waba_id = $1 and phone = $2", [String(b.waba_id), phone]);
        if (ex && ex.company_id != null && ex.company_id !== company) return bad("Este número já pertence a outra empresa", 409);
      }
      const [row] = await query(
        `insert into contacts (waba_id, phone, name, email, fields, department_id, notes, source, company_id)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, 'manual', $8)
         on conflict (waba_id, phone) do update set name = coalesce(excluded.name, contacts.name), email = coalesce(excluded.email, contacts.email),
           fields = contacts.fields || excluded.fields, department_id = coalesce(excluded.department_id, contacts.department_id), notes = coalesce(excluded.notes, contacts.notes),
           company_id = coalesce(contacts.company_id, excluded.company_id), updated_at = now()
         returning *`,
        [String(b.waba_id), phone, b.name || null, b.email || null, b.fields || {}, dep, b.notes || null, company],
      );
      if (Array.isArray(b.tag_ids)) {
        const tagIds = b.tag_ids.map(Number).filter(Number.isInteger);
        for (const t of tagIds) if (!(await ownedBy("tags", t))) return bad("Etiqueta não encontrada");
        if (company) await query("delete from contact_tags where contact_id = $1 and tag_id in (select id from tags where company_id = $2)", [row.id, company]);
        else await query("delete from contact_tags where contact_id = $1", [row.id]);
        for (const t of tagIds) await query("insert into contact_tags (contact_id, tag_id) values ($1, $2) on conflict do nothing", [row.id, t]);
      }
      if (Array.isArray(b.list_ids) && !company) {
        const listIds = b.list_ids.map(Number).filter(Number.isInteger);
        await query("delete from list_contacts where contact_id = $1 and not (list_id = any($2::int[]))", [row.id, listIds]);
        for (const l of listIds) if (await listVisible(scope, l)) await query("insert into list_contacts (list_id, contact_id) values ($1, $2) on conflict do nothing", [l, row.id]);
      }
      if (b.opt_out !== undefined) await query("update contacts set opt_out = $2, opt_out_at = case when $2 then coalesce(opt_out_at, now()) else null end where id = $1", [row.id, Boolean(b.opt_out)]);
      return NextResponse.json({ contact: row });
    }

    // ---- criar na hora (usado pela barra de gerenciamento) ----
    if (b.action === "create_tag") {
      const name = String(b.name || "").trim().slice(0, 60);
      if (!name) return bad("Dê um nome para a tag");
      const color = typeof b.color === "string" && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
      await query("insert into tags (name, color, company_id) values ($1, $2, $3) on conflict do nothing", [name, color, company]);
      const [tag] = await query("select id, name, color, company_id from tags where coalesce(company_id, 0) = coalesce($2::int, 0) and lower(name) = lower($1)", [name, company]);
      return NextResponse.json({ tag });
    }
    if (b.action === "create_list") {
      if (company) return bad("Sem permissão", 403);
      const name = String(b.name || "").trim().slice(0, 120);
      if (!name) return bad("Dê um nome para a lista");
      const waba = b.waba_id ? String(b.waba_id) : null;
      if (waba && !canSee(scope, waba)) return bad("Conta não encontrada", 404);
      const [list] = await query("insert into lists (name, description, waba_id) values ($1, $2, $3) returning id, name, waba_id", [name, b.description || null, waba]);
      return NextResponse.json({ list: { ...list, total: 0 } });
    }
    if (b.action === "create_department") {
      if (company || !isManagerRole(r.user.role)) return bad("Só gestores e administradores criam departamentos", 403);
      const name = String(b.name || "").trim().slice(0, 60);
      if (!name) return bad("Dê um nome para o departamento");
      await query("insert into departments (name, color) values ($1, $2) on conflict do nothing", [name, b.color || null]);
      const [department] = await query("select id, name, color from departments where company_id is null and lower(name) = lower($1)", [name]);
      return NextResponse.json({ department });
    }

    // ---- ações em massa: contatos marcados ou "todos os N do filtro" ----
    let ids: number[];
    if (b.all) {
      const args: any[] = [];
      const W = whereSql(contactWhere(scope, readFilter(b.filter || {}), args));
      ids = (await query<{ id: number }>(`select k.id from contacts k ${W} limit ${BULK_MAX}`, args)).map((x) => Number(x.id));
    } else {
      ids = (b.ids || []).map(Number).filter(Number.isInteger);
      if (!scope.all && ids.length) { // só nos contatos das BMs visíveis (e, no portal, da empresa)
        ids = company
          ? (await query<{ id: number }>("select id from contacts where id = any($1::int[]) and company_id = $2", [ids, company])).map((x) => x.id)
          : (await query<{ id: number }>("select id from contacts where id = any($1::int[]) and waba_id = any($2::text[])", [ids, scope.wabas])).map((x) => x.id);
      }
    }
    if (!ids.length) return bad("Nenhum contato selecionado");
    if (company && (b.action === "add_list" || b.action === "remove_list" || b.action === "delete")) return bad("Sem permissão", 403);
    if ((b.action === "add_tag" || b.action === "remove_tag") && !(await ownedBy("tags", Number(b.tag_id)))) return bad("Etiqueta não encontrada");
    if (b.action === "department" && !(await ownedBy("departments", b.department_id ? Number(b.department_id) : null))) return bad("Departamento não encontrado");
    if ((b.action === "add_list" || b.action === "remove_list") && !(await listVisible(scope, Number(b.list_id)))) return bad("Lista não encontrada", 404);

    let affected = 0;
    const n = (rows: unknown[]) => { affected = rows.length; };
    if (b.action === "add_tag") n(await query("insert into contact_tags (contact_id, tag_id) select x, $2 from unnest($1::int[]) as x on conflict do nothing returning contact_id", [ids, Number(b.tag_id)]));
    else if (b.action === "remove_tag") n(await query("delete from contact_tags where tag_id = $1 and contact_id = any($2::int[]) returning contact_id", [Number(b.tag_id), ids]));
    else if (b.action === "add_list") n(await query("insert into list_contacts (list_id, contact_id) select $2, x from unnest($1::int[]) as x on conflict do nothing returning contact_id", [ids, Number(b.list_id)]));
    else if (b.action === "remove_list") n(await query("delete from list_contacts where list_id = $1 and contact_id = any($2::int[]) returning contact_id", [Number(b.list_id), ids]));
    else if (b.action === "department") n(await query("update contacts set department_id = $1, updated_at = now() where id = any($2::int[]) and department_id is distinct from $1 returning id", [b.department_id ? Number(b.department_id) : null, ids]));
    else if (b.action === "optout") n(await query("update contacts set opt_out = $1, opt_out_at = case when $1 then coalesce(opt_out_at, now()) else null end, updated_at = now() where id = any($2::int[]) and opt_out is distinct from $1 returning id", [Boolean(b.value), ids]));
    else if (b.action === "delete") {
      if (r.user.role === "atendente") return bad("Sem permissão", 403);
      // só quem nunca conversou (o histórico de atendimento continua de pé)
      const gone = await query<{ id: number }>("delete from contacts where id = any($1::int[]) and not exists (select 1 from conversations c where c.contact_id = contacts.id) returning id", [ids]);
      const g = gone.map((x) => x.id);
      if (g.length) {
        await query("delete from contact_tags where contact_id = any($1::int[])", [g]);
        await query("delete from list_contacts where contact_id = any($1::int[])", [g]);
      }
      affected = g.length;
    } else return bad("Ação inválida");
    return NextResponse.json({ ok: true, selected: ids.length, affected });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha" }, { status: 500 });
  }
}

/** A lista existe e é de uma BM visível (listas sem conta valem para todas). */
async function listVisible(scope: Awaited<ReturnType<typeof getScope>>, id: number) {
  if (!Number.isInteger(id)) return false;
  const [l] = await query<{ waba_id: string | null }>("select waba_id from lists where id = $1", [id]);
  return !!l && (!l.waba_id || canSee(scope, l.waba_id));
}
