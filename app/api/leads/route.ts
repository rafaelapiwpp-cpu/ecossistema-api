// Leads: listas importadas (CSV/planilha), tag automática por lista e importação em lotes.
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { normalizePhone } from "@/lib/phone";
import { canSee, getScope, scopeSql, scopeSqlNullable, whereOf, type Scope } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TAG_COLORS = ["#8b7cf6", "#2a78d6", "#1baf7a", "#eda100", "#eb6834", "#d03b3b", "#0ea5a5", "#c026d3"];

async function listRows(where = "", args: any[] = []) {
  return query(
    `select l.id, l.name, l.waba_id, l.description, l.tag_id, l.last_import_at, l.imported, l.created_at,
            w.name as waba_name, t.name as tag_name, t.color as tag_color,
            (select count(*) from list_contacts lc where lc.list_id = l.id)::int as total,
            (select count(*) from list_contacts lc join contacts c on c.id = lc.contact_id where lc.list_id = l.id and c.opt_out)::int as opted_out,
            (select count(*) from list_contacts lc join contacts c on c.id = lc.contact_id where lc.list_id = l.id and c.last_inbound_at is not null)::int as replied
     from lists l left join wabas w on w.id = l.waba_id left join tags t on t.id = l.tag_id ${where}
     order by coalesce(l.last_import_at, l.created_at) desc, l.id desc`, args);
}

/** Cria (ou reaproveita) uma tag com o nome informado. */
async function ensureTag(name: string): Promise<{ id: number; name: string }> {
  const clean = name.trim().slice(0, 60);
  // tags internas da equipe (company_id nulo); as etiquetas das empresas clientes vivem no portal delas
  const [exists] = await query<{ id: number; name: string }>("select id, name from tags where company_id is null and lower(name) = lower($1) limit 1", [clean]);
  if (exists) return exists;
  const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
  const [row] = await query<{ id: number; name: string }>("insert into tags (name, color) values ($1, $2) on conflict do nothing returning id, name", [clean, color]);
  if (row) return row;
  const [again] = await query<{ id: number; name: string }>("select id, name from tags where company_id is null and lower(name) = lower($1) limit 1", [clean]);
  return again;
}

/** A lista existe e é de uma BM visível (listas sem conta são de todos). */
async function listVisible(scope: Scope, id: number) {
  const [l] = await query<{ waba_id: string | null }>("select waba_id from lists where id = $1", [id]);
  return !!l && (!l.waba_id || canSee(scope, l.waba_id));
}

export async function GET() {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const scope = await getScope(r.user);
  const la: any[] = [], ca: any[] = [];
  const contactScope = scopeSql(scope, "waba_id", ca);
  const [lists, [totals]] = await Promise.all([
    listRows(whereOf([scopeSqlNullable(scope, "l.waba_id", la)]), la),
    query<{ contacts: number; in_lists: number; tags: number }>(
      `select (select count(*) from contacts ${contactScope ? `where ${contactScope}` : ""})::int as contacts,
              (select count(distinct lc.contact_id) from list_contacts lc join contacts c on c.id = lc.contact_id ${contactScope ? `where c.${contactScope}` : ""})::int as in_lists,
              (select count(*) from tags where company_id is null)::int as tags`, ca),
  ]);
  return NextResponse.json({ lists, totals });
}

export async function POST(req: Request) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const b = await req.json().catch(() => ({}));
  const bad = (m: string, code = 400) => NextResponse.json({ error: m }, { status: code });
  const manager = r.user.role !== "atendente";
  const scope = await getScope(r.user);

  try {
    // toda ação numa lista existente exige que ela seja de uma BM visível
    const lid = Number(b.id || b.list_id || 0);
    if (lid && !(await listVisible(scope, lid))) return bad("Lista não encontrada", 404);
    if (b.waba_id && !canSee(scope, String(b.waba_id))) return bad("Conta não encontrada", 404);

    if (b.action === "create_list") {
      const name = String(b.name || "").trim().slice(0, 80);
      if (!name) return bad("Dê um nome à lista");
      const wabaId = b.waba_id ? String(b.waba_id) : null;
      if (!wabaId && !scope.all) return bad("Escolha a conta (WABA) da lista");
      let tagId: number | null = null;
      if (b.create_tag) tagId = (await ensureTag(String(b.tag_name || name))).id;
      const [row] = await query<{ id: number }>("insert into lists (name, description, waba_id, tag_id) values ($1, $2, $3, $4) returning id", [name, b.description ? String(b.description).slice(0, 300) : null, wabaId, tagId]);
      const [list] = await listRows("where l.id = $1", [row.id]);
      return NextResponse.json({ ok: true, list });
    }

    if (b.action === "rename") {
      const name = String(b.name || "").trim().slice(0, 80);
      if (!name || !b.id) return bad("Nome obrigatório");
      await query("update lists set name = $2, description = $3 where id = $1", [Number(b.id), name, b.description != null ? String(b.description).slice(0, 300) : null]);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "set_tag") {
      // liga (ou cria) a tag da lista e aplica a todos os contatos dela
      if (!b.id) return bad("Lista inválida");
      const [l] = await query<{ id: number; name: string }>("select id, name from lists where id = $1", [Number(b.id)]);
      if (!l) return bad("Lista não encontrada", 404);
      const tag = await ensureTag(String(b.tag_name || l.name));
      await query("update lists set tag_id = $2 where id = $1", [l.id, tag.id]);
      await query("insert into contact_tags (contact_id, tag_id) select contact_id, $2 from list_contacts where list_id = $1 on conflict do nothing", [l.id, tag.id]);
      return NextResponse.json({ ok: true, tag });
    }

    if (b.action === "delete") {
      if (!manager) return bad("Sem permissão", 403);
      const id = Number(b.id);
      if (b.delete_contacts) {
        // apaga os contatos que só existem por causa desta lista e nunca conversaram
        await query(
          `delete from contacts c where c.id in (select contact_id from list_contacts where list_id = $1)
             and not exists (select 1 from conversations v where v.contact_id = c.id)
             and not exists (select 1 from list_contacts o where o.contact_id = c.id and o.list_id <> $1)`, [id]);
        await query("delete from contact_tags where not exists (select 1 from contacts c where c.id = contact_tags.contact_id)");
      }
      await query("delete from list_contacts where list_id = $1", [id]);
      await query("delete from lists where id = $1", [id]);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "import") {
      const listId = Number(b.list_id);
      const [list] = await query<{ id: number; waba_id: string | null; tag_id: number | null }>("select id, waba_id, tag_id from lists where id = $1", [listId]);
      if (!list) return bad("Lista não encontrada", 404);
      const wabaId = String(b.waba_id || list.waba_id || "");
      if (!wabaId) return bad("Escolha a conta (WABA)");
      const rows: any[] = Array.isArray(b.rows) ? b.rows.slice(0, 2000) : [];
      const ddi = String(b.ddi || "55").replace(/\D/g, "") || "55";
      const dep = b.department_id ? Number(b.department_id) : null;
      const tagIds = new Set<number>((b.tag_ids || []).map(Number).filter(Number.isInteger));
      if (list.tag_id) tagIds.add(list.tag_id);

      // normaliza e tira repetidos do lote
      const seen = new Set<string>();
      const phones: string[] = [], names: string[] = [], emails: string[] = [], fields: string[] = [];
      let invalid = 0, duplicates = 0;
      for (const row of rows) {
        const phone = normalizePhone(row.phone, ddi);
        if (!phone) { invalid++; continue; }
        if (seen.has(phone)) { duplicates++; continue; }
        seen.add(phone);
        const f: Record<string, any> = {};
        for (const [k, v] of Object.entries(row.fields || {})) { const key = String(k).trim().slice(0, 60); if (key && v !== "" && v != null) f[key] = typeof v === "string" ? v.slice(0, 500) : v; }
        phones.push(phone);
        names.push(row.name ? String(row.name).trim().slice(0, 120) : "");
        emails.push(row.email ? String(row.email).trim().slice(0, 160) : "");
        fields.push(JSON.stringify(f));
      }

      let inserted = 0, updated = 0;
      if (phones.length) {
        const out = await query<{ id: number; inserted: boolean }>(
          `insert into contacts (waba_id, phone, name, email, fields, department_id, source)
           select $1, d.phone, nullif(d.name, ''), nullif(d.email, ''), d.fields::jsonb, $6, 'importacao'
           from unnest($2::text[], $3::text[], $4::text[], $5::text[]) as d(phone, name, email, fields)
           on conflict (waba_id, phone) do update set
             name = coalesce(nullif(excluded.name, ''), contacts.name),
             email = coalesce(nullif(excluded.email, ''), contacts.email),
             fields = contacts.fields || excluded.fields,
             department_id = coalesce(excluded.department_id, contacts.department_id),
             updated_at = now()
           returning id, (xmax = 0) as inserted`,
          [wabaId, phones, names, emails, fields, dep]);
        const ids = out.map((o) => o.id);
        inserted = out.filter((o) => o.inserted).length;
        updated = out.length - inserted;
        await query("insert into list_contacts (list_id, contact_id) select $1, id from unnest($2::int[]) as u(id) on conflict do nothing", [listId, ids]);
        for (const t of tagIds) await query("insert into contact_tags (contact_id, tag_id) select id, $2 from unnest($1::int[]) as u(id) on conflict do nothing", [ids, t]);
      }
      await query("update lists set last_import_at = now(), imported = imported + $2, waba_id = coalesce(waba_id, $3) where id = $1", [listId, inserted + updated, wabaId]);
      return NextResponse.json({ inserted, updated, invalid, duplicates });
    }

    return bad("Ação inválida");
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falha" }, { status: 500 });
  }
}
