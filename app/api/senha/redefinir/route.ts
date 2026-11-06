import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { query } from "@/lib/db";
import { COOKIE, cookieOptions, sessionValue } from "@/lib/auth";
import { completeReset } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

/** Esqueci minha senha — passo 2: confere o código, grava a nova senha e já entra. */
export async function POST(req: Request) {
  const s = await getSettings();
  if (!s) return NextResponse.redirect(new URL("/setup", req.url), 303);
  const f = await req.formData();
  const login = String(f.get("login") || "").trim().slice(0, 200);
  const code = String(f.get("code") || "").trim().slice(0, 12);
  const pw = String(f.get("password") || ""), again = String(f.get("password2") || "");
  const go = (q: Record<string, string>) => NextResponse.redirect(new URL(`/esqueci-senha?${new URLSearchParams(q)}`, req.url), 303);
  if (!login || !code) return go({ login, enviado: "1", erro: "codigo" });
  const r = await completeReset(login, code, pw, again);
  if (!r.ok) return go({ login, enviado: "1", erro: r.error });
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(COOKIE, sessionValue(s, { id: r.user.id, password_hash: r.password_hash }), cookieOptions());
  await query("update users set last_login_at = now() where id = $1", [r.user.id]);
  return res;
}
