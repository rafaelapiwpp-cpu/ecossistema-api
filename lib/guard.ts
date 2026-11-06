import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { hasDb } from "./db";
import { getSettings, type Settings } from "./settings";
import { fetchSessionUser, sessionCookie, verifySessionUser, type User } from "./auth";
import { isAdminRole, isClient, isManagerRole, isMaster } from "./roles";
import { companyById } from "./access";

export type Session = { s: Settings; user: User };
type Need = {
  admin?: boolean; manager?: boolean; master?: boolean; allowPasswordChange?: boolean;
  /** Rota/página também aberta a usuários-cliente (portal). Por padrão, cliente não entra em nada do painel interno. */
  client?: boolean;
};

/** Configurações + usuário da sessão, consultados em paralelo (uma ida ao banco a menos por requisição). */
async function resolve(): Promise<{ s: Settings | null; user: User | null }> {
  const c = await sessionCookie();
  const [s, u] = await Promise.all([getSettings(), fetchSessionUser(c)]);
  if (!s) return { s: null, user: null };
  return { s, user: verifySessionUser(s, c, u) };
}

/** Papel suficiente para o que foi pedido (master > admin > gestor > atendente; cliente só onde for permitido). */
function allowed(user: User, need: Need) {
  if (isClient(user.role) && !need.client) return "Área restrita à equipe";
  if (need.master && !isMaster(user.role)) return "Apenas o Master";
  if (need.admin && !isAdminRole(user.role)) return "Apenas administradores";
  if (need.manager && !isManagerRole(user.role)) return "Apenas administradores e gestores";
  return null;
}

/** Endereço inicial de um usuário-cliente: o portal da empresa dele (ou o login, se a empresa sumiu). */
export async function clientHome(user: { company_id?: number | null }) {
  const c = await companyById(user.company_id);
  return c && c.active ? `/${c.slug}` : "/login";
}

/** Sessão atual ou null (sem banco, sem configuração ou sem login). */
export async function getSession(): Promise<Session | null> {
  if (!hasDb()) return null;
  const { s, user } = await resolve();
  return s && user ? { s, user } : null;
}

/** Para rotas de API: devolve a sessão ou a resposta de erro. */
export async function requireSession(opts: Need = {}): Promise<Session | { res: NextResponse }> {
  if (!hasDb()) return { res: NextResponse.json({ error: "Banco de dados não configurado" }, { status: 400 }) };
  const { s, user } = await resolve();
  if (!s) return { res: NextResponse.json({ error: "Sistema ainda não configurado" }, { status: 400 }) };
  if (!user) return { res: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.must_change_password && !opts.allowPasswordChange) return { res: NextResponse.json({ error: "Troque a senha provisória antes de continuar.", code: "change_password" }, { status: 403 }) };
  const deny = allowed(user, opts);
  if (deny) return { res: NextResponse.json({ error: deny }, { status: 403 }) };
  return { s, user };
}

export function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

/** Para páginas do painel: redireciona se não houver configuração ou sessão (layout e página renderizam em paralelo). */
export async function requirePage(opts: Need = {}): Promise<Session | null> {
  if (!hasDb()) return null; // modo demonstração
  const { s, user } = await resolve();
  if (!s) redirect("/setup");
  if (!user) redirect("/login");
  if (user.must_change_password && !opts.allowPasswordChange) redirect("/trocar-senha");
  if (isClient(user.role) && !opts.client) redirect(await clientHome(user)); // cliente nunca vê o painel interno
  if (allowed(user, opts)) redirect("/");
  return { s, user };
}
