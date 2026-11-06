// Filtros da tela Contatos — os mesmos valem para a listagem, a exportação e as ações em massa
// ("selecionar todos os N do filtro"), para que o que a pessoa vê seja exatamente o que é alterado/baixado.
import { companySql, scopeSql, type Scope } from "./access";

/** Cores sugeridas para tags novas. */
export const TAG_COLORS = ["#8b7cf6", "#2a78d6", "#1baf7a", "#eda100", "#eb6834", "#d03b3b", "#0ea5a5", "#c026d3"];

/** Origem do contato (como ele chegou no HUB), em grupos fáceis de filtrar. */
export const SOURCE_GROUPS: Record<string, { label: string; values: string[] }> = {
  organico: { label: "Conversa (orgânico)", values: ["whatsapp", "celular"] },
  importacao: { label: "Importação (planilha)", values: ["importacao"] },
  automacao: { label: "Disparo ou fluxo", values: ["fluxo", "disparo", "teste"] },
  externo: { label: "Outra ferramenta", values: ["externo"] },
  manual: { label: "Cadastro manual", values: ["manual"] },
};

const KEYS = ["q", "waba", "department", "tag", "list", "optout", "source", "replied", "recent"] as const;
export type ContactFilter = Partial<Record<(typeof KEYS)[number], string>>;

/** Lê os filtros da querystring (GET) ou do corpo (ações em massa). */
export function readFilter(p: URLSearchParams | Record<string, unknown> | null | undefined): ContactFilter {
  const f: ContactFilter = {};
  for (const k of KEYS) {
    const v = p instanceof URLSearchParams ? p.get(k) : p?.[k];
    if (v != null && String(v).trim() !== "") f[k] = String(v).trim();
  }
  return f;
}

/** Condições SQL (contatos com o apelido "k"): escopo do usuário + filtros. Os parâmetros entram em `args`. */
export function contactWhere(scope: Scope, f: ContactFilter, args: any[]): string[] {
  const where: string[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace(/\?/g, `$${args.length}`)); };
  const sc = scopeSql(scope, "k.waba_id", args);
  if (sc) where.push(sc);
  const cc = companySql(scope, "k.company_id", args); // portal: só os contatos da empresa
  if (cc) where.push(cc);
  if (f.waba) add("k.waba_id = ?", f.waba);
  if (f.department === "none") where.push("k.department_id is null");
  else if (Number(f.department)) add("k.department_id = ?", Number(f.department));
  if (f.tag === "none") {
    // "sem tag": no portal só contam as etiquetas da própria empresa
    if (scope.company) add("not exists (select 1 from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = k.id and t.company_id = ?)", scope.company.id);
    else where.push("not exists (select 1 from contact_tags ct where ct.contact_id = k.id)");
  } else if (Number(f.tag)) add("exists (select 1 from contact_tags ct where ct.contact_id = k.id and ct.tag_id = ?)", Number(f.tag));
  if (!scope.client) {
    if (f.list === "none") where.push("not exists (select 1 from list_contacts lc where lc.contact_id = k.id)");
    else if (Number(f.list)) add("exists (select 1 from list_contacts lc where lc.contact_id = k.id and lc.list_id = ?)", Number(f.list));
  }
  if (f.optout === "1") where.push("k.opt_out");
  else if (f.optout === "0") where.push("not k.opt_out");
  if (f.source && SOURCE_GROUPS[f.source]) add("k.source = any(?::text[])", SOURCE_GROUPS[f.source].values);
  if (f.replied === "1") where.push("k.last_inbound_at is not null");
  else if (f.replied === "0") where.push("k.last_inbound_at is null");
  const days = Math.min(Math.max(Math.floor(Number(f.recent) || 0), 0), 3650);
  if (days) add("k.last_inbound_at >= now() - (? || ' days')::interval", String(days));
  if (f.q) {
    // busca por nome, e-mail ou telefone (com ou sem formatação: "51 98640-8283" acha 5551986408283)
    const digits = f.q.replace(/\D/g, "");
    args.push(`%${f.q}%`);
    const n = args.length;
    if (digits.length >= 4) { args.push(`%${digits}%`); where.push(`(k.name ilike $${n} or k.email ilike $${n} or k.phone like $${args.length})`); }
    else where.push(`(k.name ilike $${n} or k.email ilike $${n} or k.phone ilike $${n})`);
  }
  return where;
}

export const whereSql = (conds: string[]) => (conds.length ? `where ${conds.join(" and ")}` : "");
