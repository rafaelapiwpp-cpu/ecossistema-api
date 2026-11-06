import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { getScope } from "@/lib/access";
import { contactWhere, readFilter, whereSql } from "@/lib/contact-filters";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Exporta contatos em CSV — exatamente os mesmos filtros da tela Contatos (querystring). */
export async function GET(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const p = new URL(req.url).searchParams;
  const scope = await getScope(r.user);
  const args: any[] = [];
  const W = whereSql(contactWhere(scope, readFilter(p), args));
  const rows = await query(
    `select k.phone, k.name, k.email, k.opt_out, k.source, k.created_at, k.last_inbound_at, k.fields, d.name as departamento, w.name as conta,
            (select string_agg(t.name, ', ' order by t.name) from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = k.id) as tags,
            ${scope.client ? "null" : "(select string_agg(l.name, ', ' order by l.name) from list_contacts lc join lists l on l.id = lc.list_id where lc.contact_id = k.id)"} as listas
     from contacts k left join departments d on d.id = k.department_id left join wabas w on w.id = k.waba_id ${W} order by k.name nulls last, k.id`,
    args,
  );
  const extra = new Set<string>();
  for (const x of rows) for (const k of Object.keys(x.fields || {})) extra.add(k);
  const base = ["telefone", "nome", "email", "conta", "departamento", "tags", ...(scope.client ? [] : ["listas"]), "opt_out", "origem", "criado_em", "ultima_mensagem_do_contato"];
  const cols = [...base, ...extra];
  const esc = (v: any) => { const s = v == null ? "" : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const day = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : "");
  const lines = [cols.join(";")];
  for (const x of rows) {
    lines.push([
      x.phone, x.name, x.email, x.conta, x.departamento, x.tags, ...(scope.client ? [] : [x.listas]), x.opt_out ? "sim" : "não", x.source, day(x.created_at), day(x.last_inbound_at),
      ...[...extra].map((k) => x.fields?.[k]),
    ].map(esc).join(";"));
  }
  return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="contatos.csv"` } });
}
