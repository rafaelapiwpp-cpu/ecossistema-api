import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { onlyDigits } from "@/lib/meta";
import { canSee, getScope } from "@/lib/access";
import { applyCompanyDefaults } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Importação de contatos (linhas já lidas da planilha no navegador).
 * No portal de clientes, os contatos nascem na empresa do usuário (sem listas; etiquetas e departamento só da empresa),
 * e um telefone que já é de outra empresa é ignorado.
 */
export async function POST(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const b = await req.json().catch(() => ({}));
  const wabaId = String(b.waba_id || "");
  if (!wabaId) return NextResponse.json({ error: "Escolha a conta (WABA)" }, { status: 400 });
  const scope = await getScope(r.user);
  if (!canSee(scope, wabaId)) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  const companyId = scope.client ? scope.company?.id ?? null : null;
  if (scope.client && !companyId) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  const rows: any[] = Array.isArray(b.rows) ? b.rows : [];
  let tagIds: number[] = (b.tag_ids || []).map(Number).filter(Number.isInteger);
  let listId = b.list_id ? Number(b.list_id) : null;
  let dep = b.department_id ? Number(b.department_id) : null;
  if (companyId) {
    listId = null;
    if (tagIds.length) tagIds = (await query<{ id: number }>("select id from tags where company_id = $1 and id = any($2::int[])", [companyId, tagIds])).map((t) => t.id);
    if (dep && !(await query("select 1 from departments where id = $1 and company_id = $2", [dep, companyId])).length) dep = null;
  } else if (listId) {
    const [l] = await query<{ waba_id: string | null }>("select waba_id from lists where id = $1", [listId]);
    if (!l || (l.waba_id && !canSee(scope, l.waba_id))) return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });
  }
  const defaultDdi = String(b.ddi || "55");
  let imported = 0, invalid = 0;
  const seen = new Set<string>();

  for (const row of rows.slice(0, 20000)) {
    let phone = onlyDigits(String(row.phone || ""));
    if (phone.length >= 10 && phone.length <= 11 && !phone.startsWith(defaultDdi)) phone = defaultDdi + phone; // sem DDI
    if (phone.length < 10 || phone.length > 15 || seen.has(phone)) { invalid++; continue; }
    seen.add(phone);
    if (companyId) {
      const [ex] = await query<{ company_id: number | null }>("select company_id from contacts where waba_id = $1 and phone = $2", [wabaId, phone]);
      if (ex && ex.company_id != null && ex.company_id !== companyId) { invalid++; continue; } // é de outra empresa
    }
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(row.fields || {})) if (v !== "" && v != null) fields[String(k).trim()] = v;
    const [c] = await query<{ id: number; inserted: boolean }>(
      `insert into contacts (waba_id, phone, name, email, fields, department_id, source, company_id)
       values ($1, $2, $3, $4, $5::jsonb, $6, 'importacao', $7)
       on conflict (waba_id, phone) do update set name = coalesce(nullif(excluded.name, ''), contacts.name), email = coalesce(nullif(excluded.email, ''), contacts.email),
         fields = contacts.fields || excluded.fields, department_id = coalesce(excluded.department_id, contacts.department_id),
         company_id = coalesce(contacts.company_id, excluded.company_id), updated_at = now()
       returning id, (xmax = 0) as inserted`,
      [wabaId, phone, row.name ? String(row.name).trim() : null, row.email ? String(row.email).trim() : null, fields, dep, companyId],
    );
    for (const t of tagIds) await query("insert into contact_tags (contact_id, tag_id) values ($1, $2) on conflict do nothing", [c.id, t]);
    if (listId) await query("insert into list_contacts (list_id, contact_id) values ($1, $2) on conflict do nothing", [listId, c.id]);
    if (companyId && c.inserted) await applyCompanyDefaults(companyId, c.id, null);
    imported++;
  }
  return NextResponse.json({ imported, invalid });
}
