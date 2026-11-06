import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { COOKIE, cookieOptions, hashPassword, sessionValue, verifyPassword } from "@/lib/auth";
import { isClient } from "@/lib/roles";
import { clientHome } from "@/lib/guard";

export const dynamic = "force-dynamic";

/** Troca da própria senha (obrigatória no primeiro acesso de quem recebeu senha provisória). */
export async function POST(req: Request) {
  const r = await requireSession({ allowPasswordChange: true, client: true });
  if ("res" in r) return NextResponse.redirect(new URL("/login", req.url), 303);
  const f = await req.formData();
  const pw = String(f.get("password") || ""), again = String(f.get("password2") || "");
  const back = (erro: string) => NextResponse.redirect(new URL(`/trocar-senha?erro=${erro}`, req.url), 303);
  if (pw.length < 8) return back("curta");
  if (pw !== again) return back("confirmacao");
  if (verifyPassword(pw, r.user.password_hash)) return back("igual");
  const hash = hashPassword(pw);
  await query("update users set password_hash = $2, must_change_password = false where id = $1", [r.user.id, hash]);
  const res = NextResponse.redirect(new URL(isClient(r.user.role) ? await clientHome(r.user) : "/", req.url), 303);
  res.cookies.set(COOKIE, sessionValue(r.s, { id: r.user.id, password_hash: hash }), cookieOptions()); // continua logado com a senha nova
  return res;
}
