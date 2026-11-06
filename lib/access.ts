// Escopo de dados por usuário: o que cada um enxerga depende da visibilidade da conexão (BM) dona da conta.
// - Master: vê tudo e escolhe a visão (Tudo · Minha BM · Equipe), guardada num cookie.
// - Demais papéis internos: só as contas (WABAs) de conexões marcadas como "Equipe".
// - Cliente (portal): só os números da empresa dele (e, se o usuário tiver números próprios, só esses) —
//   o escopo traz a lista de números e a empresa, e TODA consulta do portal filtra pelos dois.
import { cookies } from "next/headers";
import { query } from "./db";
import { isClient, isMaster } from "./roles";

export type View = "all" | "mine" | "team";
export const VIEW_COOKIE = "hub_view";
export const VIEW_LABEL: Record<View, string> = { all: "Tudo", mine: "Minha BM", team: "Equipe" };

export type Company = {
  id: number; name: string; slug: string; primary_color: string; secondary_color: string | null; logo_url: string | null;
  tagline?: string | null; default_department_id?: number | null;
  /** Recursos ligados pela equipe para esta empresa (ex.: { teleentrega: true }) — ver FEATURES em lib/companies. */
  features?: Record<string, boolean> | null;
  active: boolean; created_at?: string; updated_at?: string;
};

export type Scope = {
  all: boolean; wabas: string[]; conns: number[]; master: boolean; view: View;
  /** Portal: números (phone_number_id) que este usuário atende. Ausente para a equipe interna. */
  phones?: string[];
  /** Portal: empresa do usuário. */
  company?: Company | null;
  client?: boolean;
};

type ScopeUser = { id?: number; role: string; company_id?: number | null };

export async function readView(): Promise<View> {
  try {
    const v = (await cookies()).get(VIEW_COOKIE)?.value;
    return v === "mine" || v === "team" ? v : "all";
  } catch { return "all"; }
}

/** Empresa pelo endereço (slug), só se estiver ativa. */
export async function companyBySlug(slug: string): Promise<Company | null> {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  try {
    const [c] = await query<Company>("select * from companies where slug = $1 and active limit 1", [slug]);
    return c || null;
  } catch { return null; } // antes da migração
}

export async function companyById(id: number | null | undefined): Promise<Company | null> {
  if (!id) return null;
  try {
    const [c] = await query<Company>("select * from companies where id = $1 limit 1", [id]);
    return c || null;
  } catch { return null; }
}

/** Números que um usuário-cliente atende: os dele ou, se não tiver nenhum marcado, todos os da empresa. */
export async function clientPhones(userId: number, companyId: number): Promise<string[]> {
  const [mine, all] = await Promise.all([
    query<{ phone_number_id: string }>("select phone_number_id from user_phones where user_id = $1", [userId]),
    query<{ phone_number_id: string }>("select phone_number_id from company_phones where company_id = $1", [companyId]),
  ]);
  const allowed = new Set(all.map((p) => p.phone_number_id));
  const own = mine.map((p) => p.phone_number_id).filter((p) => allowed.has(p));
  return own.length ? own : [...allowed];
}

/** Contas (WABAs) — e, no portal, números — que o usuário pode ver. */
export async function getScope(user: ScopeUser, view?: View): Promise<Scope> {
  const v = !isClient(user.role) && isMaster(user.role) ? view ?? (await readView()) : undefined;
  return loadScope(user, v);
}

// Cache curto do escopo, só para o canal de novidades (/api/pulse), que pergunta a cada ~1,5 s com a tela aberta.
// As demais rotas leem o escopo na hora (a empresa e as automações mudam pelas telas e precisam valer no mesmo instante).
// Mudanças em empresas, números e conexões limpam este cache na instância; nas demais valem em até 10 s.
const SCOPE_TTL = 10_000;
const scopeCache = new Map<string, { at: number; p: Promise<Scope> }>();
export const clearScopeCache = () => scopeCache.clear();

export async function getScopeCached(user: ScopeUser): Promise<Scope> {
  const v = !isClient(user.role) && isMaster(user.role) ? await readView() : undefined;
  const key = `${user.id ?? "-"}|${user.role}|${user.company_id ?? "-"}|${v ?? "-"}`;
  const now = Date.now();
  const hit = scopeCache.get(key);
  if (hit && now - hit.at < SCOPE_TTL) return hit.p;
  if (scopeCache.size > 300) for (const [k, e] of scopeCache) if (now - e.at >= SCOPE_TTL) scopeCache.delete(k);
  const p = loadScope(user, v);
  scopeCache.set(key, { at: now, p });
  p.catch(() => { if (scopeCache.get(key)?.p === p) scopeCache.delete(key); });
  return p;
}

async function loadScope(user: ScopeUser, view?: View): Promise<Scope> {
  if (isClient(user.role)) {
    const empty: Scope = { all: false, wabas: [], conns: [], master: false, view: "team", phones: [], company: null, client: true };
    if (!user.id || !user.company_id) return empty;
    const company = await companyById(user.company_id);
    if (!company || !company.active) return empty;
    const phones = await clientPhones(user.id, company.id);
    const wabas = phones.length
      ? (await query<{ waba_id: string }>("select distinct waba_id from phone_numbers where id = any($1::text[])", [phones])).map((w) => w.waba_id)
      : [];
    return { all: false, wabas, conns: [], master: false, view: "team", phones, company, client: true };
  }
  const master = isMaster(user.role);
  const v: View = master ? view ?? (await readView()) : "team";
  if (master && v === "all") return { all: true, wabas: [], conns: [], master, view: v };
  let rows: { id: string; visibility: string | null }[] = [], cs: { id: number; visibility: string }[] = [];
  try {
    [rows, cs] = await Promise.all([
      query<{ id: string; visibility: string | null }>("select w.id, c.visibility from wabas w left join connections c on c.id = w.connection_id"),
      query<{ id: number; visibility: string }>("select id, visibility from connections"),
    ]);
  } catch (e: any) {
    if (e?.code !== "42P01" && e?.code !== "42703") throw e; // antes da migração: ninguém além do Master vê nada
  }
  // "Minha BM" = conexões só do Master + contas antigas sem conexão; "Equipe" = conexões compartilhadas
  const side = (vis: string | null) => (v === "team" ? vis === "team" : vis !== "team");
  const wabas = rows.filter((r) => side(r.visibility)).map((r) => r.id);
  const conns = cs.filter((c) => side(c.visibility)).map((c) => Number(c.id));
  return { all: false, wabas, conns, master, view: v };
}

export const canSee = (scope: Scope, wabaId: string | null | undefined) => scope.all || (!!wabaId && scope.wabas.includes(String(wabaId)));
export const canSeeConn = (scope: Scope, connId: number | null | undefined) => scope.all || (connId != null && scope.conns.includes(Number(connId)));
/** Portal: o número está entre os que o usuário atende (equipe interna: vale a conta). */
export const canSeePhone = (scope: Scope, phoneNumberId: string | null | undefined) =>
  scope.phones ? !!phoneNumberId && scope.phones.includes(String(phoneNumberId)) : true;

/** Filtro SQL "<col> = any($n)" (vazio quando o usuário vê tudo). Use com `where`/`and` montados por quem chama. */
export function scopeSql(scope: Scope, col: string, args: any[]): string {
  if (scope.all) return "";
  args.push(scope.wabas);
  return `${col} = any($${args.length}::text[])`;
}

/** Igual ao scopeSql, mas aceita linhas sem conta (ex.: listas criadas sem WABA). */
export function scopeSqlNullable(scope: Scope, col: string, args: any[]): string {
  if (scope.all) return "";
  args.push(scope.wabas);
  return `(${col} is null or ${col} = any($${args.length}::text[]))`;
}

/** Portal: "<col> = any(<números do usuário>)". Vazio para a equipe interna. */
export function phoneSql(scope: Scope, col: string, args: any[]): string {
  if (!scope.phones) return "";
  args.push(scope.phones);
  return `${col} = any($${args.length}::text[])`;
}

/** Portal: "<col> = <empresa>". Equipe interna: "<col> is null" quando `internalOnly`, senão vazio. */
export function companySql(scope: Scope, col: string, args: any[], internalOnly = false): string {
  if (scope.company) { args.push(scope.company.id); return `${col} = $${args.length}`; }
  return internalOnly ? `${col} is null` : "";
}

/** Junta condições não vazias com "and" e prefixa com "where" (ou devolve ""). */
export const whereOf = (conds: (string | null | undefined | false)[]) => {
  const c = conds.filter(Boolean) as string[];
  return c.length ? `where ${c.join(" and ")}` : "";
};
