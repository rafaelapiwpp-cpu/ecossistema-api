import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { query } from "./db";
import { findUserByLogin, hashPassword, type User } from "./auth";
import { isEmail, mailConfig, resetCodeMail, sendMail, maskEmail } from "./mail";
import type { Settings } from "./settings";

export const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_WINDOW = 3; // por usuário, a cada CODE_MINUTES

/** Para onde vai o código: e-mail de recuperação ou, se o login já for um e-mail, o próprio login. */
export function recoveryAddress(u: Pick<User, "email" | "recovery_email">) {
  const r = (u.recovery_email || "").trim();
  if (isEmail(r)) return r;
  return isEmail(u.email) ? u.email.trim() : null;
}

const hashCode = (code: string, salt: string) => createHash("sha256").update(`${salt}:${code}`).digest("hex");

export type RequestResult =
  | { status: "sent"; to: string }
  | { status: "mail_off" | "not_found" | "no_email" | "rate" }
  | { status: "mail_error"; message: string };

/** Gera e envia um código de 6 dígitos. Nunca diz se o login existe além do necessário para o próprio dono. */
export async function requestReset(s: Settings, login: string): Promise<RequestResult> {
  const cfg = mailConfig(s);
  if (!cfg) return { status: "mail_off" };
  const user = await findUserByLogin(login);
  if (!user) return { status: "not_found" };
  const to = recoveryAddress(user);
  if (!to) return { status: "no_email" };

  await query("delete from password_resets where expires_at < now() - interval '1 day'");
  const [{ n }] = await query<{ n: number }>(
    "select count(*)::int as n from password_resets where user_id = $1 and created_at > now() - make_interval(mins => $2)", [user.id, CODE_MINUTES]);
  if (n >= MAX_REQUESTS_PER_WINDOW) return { status: "rate" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const salt = randomBytes(16).toString("hex");
  // um código por vez: os anteriores deixam de valer
  await query("update password_resets set used_at = now() where user_id = $1 and used_at is null", [user.id]);
  await query("insert into password_resets (user_id, code_hash, expires_at) values ($1, $2, now() + make_interval(mins => $3))",
    [user.id, `${salt}:${hashCode(code, salt)}`, CODE_MINUTES]);
  const m = resetCodeMail(user.name, code, CODE_MINUTES);
  try {
    await sendMail(cfg, to, m.subject, m.text, m.html);
  } catch (e: any) {
    await query("update password_resets set used_at = now() where user_id = $1 and used_at is null", [user.id]);
    return { status: "mail_error", message: String(e?.message || e).slice(0, 200) };
  }
  return { status: "sent", to: maskEmail(to) };
}

export type CompleteResult = { ok: true; user: User; password_hash: string } | { ok: false; error: "codigo" | "curta" | "confirmacao" };

/** Confere o código e grava a nova senha. Cada código aceita poucas tentativas e vale uma vez só. */
export async function completeReset(login: string, code: string, password: string, again: string): Promise<CompleteResult> {
  if (password.length < 8) return { ok: false, error: "curta" };
  if (password !== again) return { ok: false, error: "confirmacao" };
  const user = await findUserByLogin(login);
  if (!user) return { ok: false, error: "codigo" };
  const [row] = await query<{ id: number; code_hash: string; attempts: number }>(
    "select id, code_hash, attempts from password_resets where user_id = $1 and used_at is null and expires_at > now() order by created_at desc limit 1", [user.id]);
  if (!row) return { ok: false, error: "codigo" };
  if (row.attempts >= MAX_ATTEMPTS) {
    await query("update password_resets set used_at = now() where id = $1", [row.id]);
    return { ok: false, error: "codigo" };
  }
  const [salt, hex] = row.code_hash.split(":");
  const a = Buffer.from(hashCode(code.replace(/\D/g, ""), salt), "hex"), b = Buffer.from(hex || "", "hex");
  const good = a.length === b.length && timingSafeEqual(a, b);
  if (!good) {
    await query("update password_resets set attempts = attempts + 1 where id = $1", [row.id]);
    return { ok: false, error: "codigo" };
  }
  const password_hash = hashPassword(password);
  await query("update users set password_hash = $2, must_change_password = false where id = $1", [user.id, password_hash]);
  await query("update password_resets set used_at = now() where user_id = $1 and used_at is null", [user.id]);
  return { ok: true, user, password_hash };
}
