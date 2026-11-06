import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { clean, requireSession } from "@/lib/guard";
import { isMaster } from "@/lib/roles";
import { BRAND } from "@/lib/brand";
import { isEmail, mailConfig, mailFromEnv, sendMail } from "@/lib/mail";
import { recoveryAddress } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

/** Configurações gerais. Atendimento: administradores. App principal da Meta: só o Master (os tokens de cada BM ficam em Conexões). */
export async function POST(req: Request) {
  const r = await requireSession({ admin: true });
  if ("res" in r) return r.res;
  const f = await req.formData();
  const back = (q: string) => NextResponse.redirect(new URL(`/configuracoes?${q}`, req.url), 303);

  const section = clean(f.get("section"));

  // E-mail de recuperação de senha (só o Master; as variáveis HUB_MAIL_* da Vercel, quando existem, têm prioridade)
  if (section === "mail") {
    if (!isMaster(r.user.role)) return back("erro=master");
    if (mailFromEnv()) return back("erro=mail_env");
    const from = clean(f.get("mail_from")).toLowerCase();
    const user = clean(f.get("mail_user")).toLowerCase();
    const pass = String(f.get("mail_pass") ?? "").replace(/\s+/g, ""); // senha de app do Gmail vem com espaços
    const host = clean(f.get("mail_host")).toLowerCase();
    const port = Math.min(Math.max(Number(f.get("mail_port") || 0), 0), 65535);
    if (from && !isEmail(from)) return back("erro=mail_from");
    await query(
      `update settings set mail_from = nullif($1, ''), mail_user = nullif($2, ''), mail_pass = coalesce(nullif($3, ''), mail_pass),
         mail_host = nullif($4, ''), mail_port = nullif($5, 0), updated_at = now() where id = 1`,
      [from, user, pass, host, port],
    );
    if (f.get("mail_clear") === "on") await query("update settings set mail_pass = null, updated_at = now() where id = 1");
    return back("ok=1#email");
  }
  if (section === "mail_test") {
    if (!isMaster(r.user.role)) return back("erro=master");
    const cfg = mailConfig(r.s);
    if (!cfg) return back("erro=mail_off#email");
    const to = clean(f.get("to")) || recoveryAddress(r.user) || "";
    if (!isEmail(to)) return back("erro=mail_to#email");
    try {
      await sendMail(cfg, to, `Teste de e-mail do ${BRAND.name}`, `Este é um e-mail de teste do ${BRAND.name}. Se você o recebeu, o envio de códigos de redefinição de senha está funcionando.`);
    } catch (e: any) {
      return back(`erro=mail_send&detalhe=${encodeURIComponent(String(e?.message || e).slice(0, 160))}#email`);
    }
    return back(`mail_ok=${encodeURIComponent(to)}#email`);
  }

  if (section === "app") {
    if (!isMaster(r.user.role)) return back("erro=master");
    const secret = clean(f.get("meta_app_secret"));
    const appId = clean(f.get("meta_app_id"));
    const insights = f.get("insights_enabled") === "on";
    await query(
      `update settings set meta_app_secret = coalesce(nullif($1, ''), meta_app_secret), meta_app_id = nullif($2, ''), insights_enabled = $3, updated_at = now() where id = 1`,
      [secret, appId, insights],
    );
    return back("ok=1");
  }

  const optout = clean(f.get("optout_keywords"));
  const optin = clean(f.get("optin_keywords"));
  const optoutReply = clean(f.get("optout_reply"));
  const autoclose = Math.min(Math.max(Number(f.get("autoclose_days") || 3), 0), 90);
  await query(
    `update settings set
       optout_keywords = coalesce(nullif($1, ''), optout_keywords),
       optin_keywords = coalesce(nullif($2, ''), optin_keywords),
       optout_reply = $3,
       autoclose_days = $4,
       updated_at = now()
     where id = 1`,
    [optout, optin, optoutReply, autoclose],
  );
  return back("ok=1");
}
