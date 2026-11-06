import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { query } from "./db";
import type { Settings } from "./settings";
import type { Role } from "./roles";
export { ROLE_LABEL } from "./roles";

export const COOKIE = "pw_session";

export type User = {
  id: number; name: string; email: string; password_hash: string;
  role: Role; department_id: number | null; active: boolean; must_change_password?: boolean; recovery_email?: string | null;
  /** Empresa do usuário-cliente (portal); null para a equipe interna. */
  company_id?: number | null;
  created_at: string; last_login_at: string | null;
};

export const randomToken = (bytes = 24) => randomBytes(bytes).toString("hex");

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const a = scryptSync(pw, salt, 64);
  const b = Buffer.from(hex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Valor do cookie: "<id>.<hmac>". Trocar a senha do usuário invalida as sessões dele. */
export function sessionValue(s: Settings, u: { id: number; password_hash: string }) {
  const mac = createHmac("sha256", s.session_secret).update(`u:${u.id}:${u.password_hash}`).digest("hex");
  return `${u.id}.${mac}`;
}

function safeEqual(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function findUserByLogin(login: string): Promise<User | null> {
  const rows = await query<User>("select * from users where lower(email) = lower($1) and active limit 1", [login.trim()]);
  return rows[0] || null;
}

/** Lê o cookie de sessão: id do usuário + valor completo (ou null). */
export async function sessionCookie(): Promise<{ id: number; value: string } | null> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value || "";
  const dot = v.indexOf(".");
  if (dot <= 0) return null;
  const id = Number(v.slice(0, dot));
  return Number.isInteger(id) ? { id, value: v } : null;
}

/** Busca o usuário do cookie sem validar a assinatura (a validação precisa das configurações). */
export async function fetchSessionUser(c: { id: number } | null): Promise<User | null> {
  if (!c) return null;
  try {
    const rows = await query<User>("select * from users where id = $1 and active limit 1", [c.id]);
    return rows[0] || null;
  } catch { return null; } // tabela ainda não existe (antes da primeira configuração)
}

/** Confere a assinatura do cookie para o usuário carregado. */
export function verifySessionUser(s: Settings, c: { value: string } | null, u: User | null): User | null {
  if (!c || !u) return null;
  return safeEqual(c.value, sessionValue(s, u)) ? u : null;
}

/** Usuário da sessão atual (ou null). */
export async function currentUser(s: Settings): Promise<User | null> {
  const c = await sessionCookie();
  return verifySessionUser(s, c, await fetchSessionUser(c));
}

export async function isAuthed(s: Settings) {
  return Boolean(await currentUser(s));
}

export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
});
