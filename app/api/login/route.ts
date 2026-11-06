import { NextResponse } from "next/server";
import { COOKIE, cookieOptions, findUserByLogin, sessionValue, verifyPassword } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { query } from "@/lib/db";
import { companyBySlug, companyById } from "@/lib/access";
import { isClient, isManagerRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const s = await getSettings();
  if (!s) return NextResponse.redirect(new URL("/setup", req.url), 303);
  const login = String(form.get("login") || "admin");
  const password = String(form.get("password") || "");
  // portal: o formulário de /{empresa}/login manda o endereço da empresa
  const slug = String(form.get("company") || "").trim().toLowerCase();
  const portal = slug ? await companyBySlug(slug) : null;
  const fail = () => NextResponse.redirect(new URL(portal ? `/${portal.slug}/login?erro=1` : "/login?erro=1", req.url), 303);

  const user = await findUserByLogin(login);
  if (!(user && verifyPassword(password, user.password_hash))) return fail();

  let dest = "/";
  if (isClient(user.role)) {
    // usuário-cliente: só entra na própria empresa (ativa)
    const mine = await companyById(user.company_id);
    if (!mine || !mine.active) return fail();
    if (portal && portal.id !== mine.id) return fail();
    dest = `/${mine.slug}`;
  } else if (portal) {
    // equipe interna entrando pelo endereço de uma empresa: administradores e gestores podem ver o portal dela
    dest = isManagerRole(user.role) ? `/${portal.slug}` : "/";
  }
  if (user.must_change_password) dest = "/trocar-senha";

  const res = NextResponse.redirect(new URL(dest, req.url), 303);
  res.cookies.set(COOKIE, sessionValue(s, user), cookieOptions());
  await query("update users set last_login_at = now() where id = $1", [user.id]);
  return res;
}
