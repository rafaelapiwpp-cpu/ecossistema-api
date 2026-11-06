import { NextResponse } from "next/server";
import { hasDb, query } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { getSettings, DEFAULTS } from "@/lib/settings";
import { COOKIE, cookieOptions, hashPassword, randomToken, sessionValue, findUserByLogin } from "@/lib/auth";
import { clean } from "@/lib/guard";
import { seal } from "@/lib/secrets";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!hasDb()) return NextResponse.json({ error: "Banco de dados não configurado" }, { status: 400 });
  if (await getSettings()) return NextResponse.redirect(new URL("/login", req.url), 303);

  const f = await req.formData();
  const name = clean(f.get("name")) || "Master";
  const email = clean(f.get("email")).toLowerCase() || "admin";
  const password = String(f.get("password") || "");
  const again = String(f.get("password2") || "");
  const token = clean(f.get("meta_token"));
  const secret = clean(f.get("meta_app_secret"));
  const business = clean(f.get("meta_business_id")) || DEFAULTS.meta_business_id;
  const appId = clean(f.get("meta_app_id")) || DEFAULTS.meta_app_id;

  const back = (erro: string) => NextResponse.redirect(new URL(`/setup?erro=${erro}`, req.url), 303);
  if (password.length < 8) return back("senha");
  if (password !== again) return back("confirmacao");
  // Meta é opcional na primeira configuração (a BM pode ser conectada depois em Conexões); se vier, vem completa.
  if ((token || secret || business) && !(token && secret && business)) return back("meta");

  await ensureSchema();
  const hash = hashPassword(password);
  await query(
    `insert into settings (id, password_hash, session_secret, meta_token, meta_app_secret, meta_business_id, meta_app_id, webhook_verify_token, cron_secret, graph_version)
     values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (id) do nothing`,
    [hash, randomToken(32), seal(token), seal(secret), business, appId, randomToken(16), randomToken(24), DEFAULTS.graph_version],
  );
  await query(
    `insert into users (name, email, password_hash, role) values ($1, $2, $3, 'master') on conflict (email) do nothing`, // quem configura é o dono (Master)
    [name, email, hash],
  );
  const s = await getSettings();
  const user = await findUserByLogin(email);
  const res = NextResponse.redirect(new URL("/configuracoes?novo=1", req.url), 303);
  if (s && user) res.cookies.set(COOKIE, sessionValue(s, user), cookieOptions());
  return res;
}
