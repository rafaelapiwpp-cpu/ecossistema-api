import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { getScope, phoneSql, scopeSql } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Lista de conversas com filtros (inbox). */
export async function GET(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const p = new URL(req.url).searchParams;
  const where: string[] = [];
  const args: any[] = [];
  const add = (sql: string, v: any) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };

  const status = p.get("status") || "open";
  if (status !== "all") add("c.status = ?", status);
  if (p.get("waba")) add("c.waba_id = ?", p.get("waba"));
  if (p.get("phone")) add("c.phone_number_id = ?", p.get("phone"));
  if (p.get("department")) add("c.department_id = ?", Number(p.get("department")));
  if (p.get("origin")) add("c.origin = ?", p.get("origin"));
  if (p.get("assigned") === "me") add("c.assigned_user_id = ?", r.user.id);
  else if (p.get("assigned") === "none") where.push("c.assigned_user_id is null");
  else if (p.get("assigned")) add("c.assigned_user_id = ?", Number(p.get("assigned")));
  if (p.get("unread") === "1") where.push("c.unread_count > 0");
  if (p.get("tag")) add("exists (select 1 from contact_tags ct where ct.contact_id = c.contact_id and ct.tag_id = ?)", Number(p.get("tag")));
  if (p.get("q")) {
    args.push(`%${p.get("q")!.trim()}%`);
    const n = args.length;
    where.push(`(k.name ilike $${n} or k.phone ilike $${n} or c.last_preview ilike $${n})`);
  }
  // só as conversas das BMs (e, no portal, dos números) que este usuário pode ver
  const scope = await getScope(r.user);
  const sc = scopeSql(scope, "c.waba_id", args);
  if (sc) where.push(sc);
  const pc = phoneSql(scope, "c.phone_number_id", args);
  if (pc) where.push(pc);
  const countArgs: any[] = [];
  const countScope = [scopeSql(scope, "waba_id", countArgs), phoneSql(scope, "phone_number_id", countArgs)].filter(Boolean).join(" and ");
  // atendente comum (e usuário-cliente com departamento) só vê o próprio departamento (ou sem departamento) — gestores e admins veem tudo
  if ((r.user.role === "atendente" || r.user.role === "cliente") && r.user.department_id) {
    args.push(r.user.department_id);
    where.push(`(c.department_id = $${args.length} or c.department_id is null or c.assigned_user_id = ${r.user.id})`);
  }
  const limit = Math.min(Number(p.get("limit") || 60), 200);
  const page = Math.max(Number(p.get("page") || 1), 1);
  args.push(limit, (page - 1) * limit);

  const rows = await query(
    `select c.*, k.name as contact_name, k.phone as contact_phone, k.opt_out, u.name as assigned_name, d.name as department_name, d.color as department_color,
            ph.display_phone_number, ph.verified_name as phone_name,
            coalesce((select json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)) from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = c.contact_id), '[]'::json) as tags
     from conversations c
     join contacts k on k.id = c.contact_id
     left join users u on u.id = c.assigned_user_id
     left join departments d on d.id = c.department_id
     left join phone_numbers ph on ph.id = c.phone_number_id
     ${where.length ? "where " + where.join(" and ") : ""}
     order by c.last_message_at desc nulls last
     limit $${args.length - 1} offset $${args.length}`,
    args,
  );
  const counts = await query<{ status: string; n: string }>(
    `select status, count(*)::text as n from conversations ${countScope ? `where ${countScope}` : ""} group by status`, countArgs,
  );
  return NextResponse.json({ rows, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])), page, limit });
}
