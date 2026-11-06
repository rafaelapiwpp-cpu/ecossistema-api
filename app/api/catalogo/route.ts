import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { companySql, getScope, phoneSql, scopeSql, scopeSqlNullable, whereOf } from "@/lib/access";
import { hasFeature } from "@/lib/companies";
import { isAdminRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Listas de apoio para as telas (departamentos, usuários, tags, listas, números, templates, respostas rápidas).
 *  No portal (usuário-cliente) tudo é da empresa dele: departamentos, pessoas, etiquetas e respostas da empresa; números e contas só os que ele atende. */
export async function GET() {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const scope = await getScope(r.user);
  // contas, números, templates e listas só das BMs que este usuário pode ver
  const a0: any[] = [], a1: any[] = [], a2: any[] = [], a3: any[] = [], a4: any[] = [], a5: any[] = [], a6: any[] = [];
  const [departments, users, tags, lists, phones, wabas, templates, quickReplies] = await Promise.all([
    query(`select * from departments ${whereOf([companySql(scope, "company_id", a0, true)])} order by name`, a0),
    scope.company
      ? query("select id, name, role, department_id, active from users where company_id = $1 order by name", [scope.company.id])
      // e-mail de recuperação (muitas vezes pessoal) só para quem administra a equipe
      : query(`select id, name, email, role, department_id, active${isAdminRole(r.user.role) ? ", recovery_email" : ""} from users where company_id is null order by role = 'master' desc, name`),
    query(`select * from tags ${whereOf([companySql(scope, "company_id", a5, true)])} order by name`, a5),
    scope.company ? Promise.resolve([]) : query(`select l.*, (select count(*) from list_contacts lc where lc.list_id = l.id)::int as total from lists l ${whereOf([scopeSqlNullable(scope, "l.waba_id", a1)])} order by name`, a1),
    query(`select id, waba_id, display_phone_number, verified_name, quality_rating, messaging_limit, label from phone_numbers ${whereOf([scopeSql(scope, "waba_id", a2), phoneSql(scope, "id", a2)])} order by display_phone_number`, a2),
    query(`select id, name, currency, connection_id from wabas ${whereOf([scopeSql(scope, "id", a3)])} order by name`, a3),
    query(`select id, waba_id, name, language, category, status, components from templates ${whereOf(["status = 'APPROVED'", scopeSql(scope, "waba_id", a4)])} order by name`, a4),
    query(`select * from quick_replies ${whereOf([companySql(scope, "company_id", a6, true)])} order by title`, a6),
  ]);
  return NextResponse.json({
    departments, users, tags, lists, phones, wabas, templates, quickReplies,
    me: { id: r.user.id, name: r.user.name, role: r.user.role, department_id: r.user.department_id },
    view: scope.view,
    company: scope.company ? { id: scope.company.id, name: scope.company.name, slug: scope.company.slug, delivery: hasFeature(scope.company, "teleentrega") } : null,
    deliveryCompanies: scope.company ? [] : (await query<{ id: number }>("select id from companies where active and (features->>'teleentrega') = 'true'")).map((c) => c.id),
  });
}
