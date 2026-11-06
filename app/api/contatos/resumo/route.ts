import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { canSee, getScope } from "@/lib/access";
import { contactWhere, whereSql } from "@/lib/contact-filters";

export const dynamic = "force-dynamic";

/**
 * Quantos contatos há em cada lista, tag e departamento.
 * Com `?waba=` (público de fluxo/disparo): só os contatos daquela conta que aceitam mensagens (sem opt-out).
 * Sem `waba` (tela Leads): todos os contatos que o usuário enxerga.
 */
export async function GET(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const p = new URL(req.url).searchParams;
  const scope = await getScope(r.user);
  const waba = p.get("waba");
  if (waba && !canSee(scope, waba)) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  const args: any[] = [];
  const conds = contactWhere(scope, waba ? { waba, optout: "0" } : {}, args);
  const W = whereSql(conds);
  const and = conds.length ? `and ${conds.join(" and ")}` : "";
  const [[{ total }], lists, tags, departments, none] = await Promise.all([
    query<{ total: number }>(`select count(*)::int as total from contacts k ${W}`, args),
    scope.client ? Promise.resolve([] as { id: number; n: number }[]) : query<{ id: number; n: number }>(`select lc.list_id as id, count(*)::int as n from list_contacts lc join contacts k on k.id = lc.contact_id where true ${and} group by 1`, args),
    query<{ id: number; n: number }>(`select ct.tag_id as id, count(*)::int as n from contact_tags ct join contacts k on k.id = ct.contact_id where true ${and} group by 1`, args),
    query<{ id: number; n: number }>(`select k.department_id as id, count(*)::int as n from contacts k where k.department_id is not null ${and} group by 1`, args),
    query<{ no_tag: number; no_dep: number }>(
      `select count(*) filter (where not exists (select 1 from contact_tags ct where ct.contact_id = k.id))::int as no_tag,
              count(*) filter (where k.department_id is null)::int as no_dep from contacts k ${W}`, args),
  ]);
  const map = (rows: { id: number; n: number }[]) => Object.fromEntries(rows.map((x) => [x.id, x.n]));
  return NextResponse.json({ total, lists: map(lists), tags: map(tags), departments: map(departments), without: { tag: none[0]?.no_tag ?? 0, department: none[0]?.no_dep ?? 0 } });
}
