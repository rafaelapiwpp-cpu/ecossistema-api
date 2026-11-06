// Limite de tentativas de login erradas, contra quem tenta adivinhar senhas.
// Janela de 15 min: 5 erros do mesmo login no mesmo endereço, 30 erros de um endereço (qualquer login)
// ou 50 erros de um login (vindos de qualquer lugar) bloqueiam novas tentativas até a janela passar.
// Acertar a senha limpa os erros daquele login.
import { query } from "./db";

const WINDOW_MIN = 15;
const MAX_LOGIN_IP = 5;
const MAX_IP = 30;
const MAX_LOGIN = 50;
export const LOCK_MINUTES = WINDOW_MIN;

/** Endereço de quem fez o pedido (na Vercel, o x-forwarded-for é preenchido pela própria Vercel). */
export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "?";
}

const norm = (login: string) => login.trim().toLowerCase().slice(0, 200);

export async function loginBlocked(login: string, ip: string): Promise<boolean> {
  try {
    const [r] = await query<{ login_ip: number; by_ip: number; by_login: number }>(
      `select count(*) filter (where login = $1 and ip = $2)::int as login_ip,
              count(*) filter (where ip = $2)::int as by_ip,
              count(*) filter (where login = $1)::int as by_login
         from login_failures where at > now() - make_interval(mins => $3) and (login = $1 or ip = $2)`,
      [norm(login), ip, WINDOW_MIN]);
    return r.login_ip >= MAX_LOGIN_IP || r.by_ip >= MAX_IP || r.by_login >= MAX_LOGIN;
  } catch (e: any) {
    if (e?.code === "42P01") return false; // antes da migração v21
    throw e;
  }
}

export async function noteLoginFailure(login: string, ip: string) {
  await query("insert into login_failures (login, ip) values ($1, $2)", [norm(login), ip]).catch(() => {});
  // limpeza leve, sem depender do cron
  if (Math.random() < 1 / 50) await query("delete from login_failures where at < now() - interval '1 day'").catch(() => {});
}

export async function clearLoginFailures(login: string) {
  await query("delete from login_failures where login = $1", [norm(login)]).catch(() => {});
}
