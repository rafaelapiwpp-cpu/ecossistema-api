// Fluxos: lista e criação.
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { fieldOptions } from "@/lib/campaigns";
import { canSee, getScope, scopeSql } from "@/lib/access";
import { isManagerRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

const RUN_COUNTS = `(select json_build_object(
  'queued', count(*) filter (where status = 'queued'), 'running', count(*) filter (where status = 'running'),
  'waiting_reply', count(*) filter (where status = 'waiting_reply'), 'waiting_time', count(*) filter (where status = 'waiting_time'),
  'done', count(*) filter (where status = 'done'), 'failed', count(*) filter (where status = 'failed'),
  'cancelled', count(*) filter (where status = 'cancelled'), 'stopped', count(*) filter (where status = 'stopped'),
  'total', count(*)) from flow_runs r where r.flow_id = f.id)`;

export async function GET() {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const args: any[] = [];
  const sc = scopeSql(await getScope(r.user), "f.waba_id", args); // só fluxos das BMs visíveis
  const rows = await query(
    `select f.id, f.name, f.waba_id, f.phone_number_id, f.status, f.last_error, f.created_at, f.updated_at,
            jsonb_array_length(coalesce(f.graph->'nodes', '[]'::jsonb)) as blocks, ${RUN_COUNTS} as counts,
            f.settings->>'description' as description,
            jsonb_path_exists(f.graph, '$.nodes[*] ? (@.type == "start").data.triggers[*] ? (@.type == "message")') as has_trigger,
            (select coalesce(jsonb_agg(jsonb_build_object('id', n->>'id', 'type', n->>'type', 'x', round((n->>'x')::numeric), 'y', round((n->>'y')::numeric))), '[]'::jsonb)
               from jsonb_array_elements(coalesce(f.graph->'nodes', '[]'::jsonb)) n) as thumb_nodes,
            (select coalesce(jsonb_agg(jsonb_build_object('from', e->>'from', 'to', e->>'to')), '[]'::jsonb)
               from jsonb_array_elements(coalesce(f.graph->'edges', '[]'::jsonb)) e) as thumb_edges,
            (select max(updated_at) from flow_runs r where r.flow_id = f.id) as last_activity,
            pn.display_phone_number, pn.verified_name as phone_name, w.name as waba_name, u.name as created_by_name
     from flows f
     left join phone_numbers pn on pn.id = f.phone_number_id
     left join wabas w on w.id = f.waba_id
     left join users u on u.id = f.created_by
     where f.status <> 'archived' ${sc ? `and ${sc}` : ""}
     order by f.updated_at desc limit 200`, args,
  );
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const r = await requireSession();
  if ("res" in r) return r.res;
  const { user } = r;
  if (!isManagerRole(user.role)) return NextResponse.json({ error: "Apenas administradores e gestores criam fluxos" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const scope = await getScope(user);

  if (b.action === "options") {
    const ca: any[] = [];
    const cs = scopeSql(scope, "waba_id", ca);
    const [fields, users, campaigns] = await Promise.all([
      fieldOptions(),
      query("select id, name, role, department_id from users where active order by name"),
      query(`select id, name from campaigns ${cs ? `where ${cs}` : ""} order by created_at desc limit 50`, ca),
    ]);
    return NextResponse.json({ fields, users, campaigns });
  }

  if (b.action === "create") {
    const name = String(b.name || "").trim();
    const wabaId = String(b.waba_id || "");
    const pnid = String(b.phone_number_id || "");
    if (!name) return NextResponse.json({ error: "Dê um nome ao fluxo" }, { status: 400 });
    const [pn] = await query<{ id: string; waba_id: string }>("select id, waba_id from phone_numbers where id = $1", [pnid]);
    if (pn && !canSee(scope, pn.waba_id)) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });
    if (!pn || pn.waba_id !== wabaId) return NextResponse.json({ error: "Escolha um número da conta selecionada" }, { status: 400 });
    const graph = {
      nodes: [
        { id: "start", type: "start", x: 80, y: 160, data: { audience: { scope: "lists", list_ids: (b.list_ids || []).map(Number).filter(Number.isInteger), tag_ids: [], exclude_tag_ids: [], exclude_recent_days: 0, waba_only: false }, rate_per_minute: 60 } },
      ],
      edges: [],
    };
    const description = String(b.description || "").trim().slice(0, 240);
    const [row] = await query<{ id: number }>(
      "insert into flows (name, waba_id, phone_number_id, graph, settings, created_by) values ($1, $2, $3, $4, $5, $6) returning id",
      [name, wabaId, pnid, graph, description ? { description } : {}, user.id],
    );
    return NextResponse.json({ ok: true, id: row.id });
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
