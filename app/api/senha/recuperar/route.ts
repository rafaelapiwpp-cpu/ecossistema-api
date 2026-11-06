import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { requestReset } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

/** Esqueci minha senha — passo 1: envia um código para o e-mail de recuperação do login informado. */
export async function POST(req: Request) {
  const s = await getSettings();
  if (!s) return NextResponse.redirect(new URL("/setup", req.url), 303);
  const f = await req.formData();
  const login = String(f.get("login") || "").trim().slice(0, 200);
  const go = (q: Record<string, string>) => NextResponse.redirect(new URL(`/esqueci-senha?${new URLSearchParams(q)}`, req.url), 303);
  if (!login) return go({ erro: "login" });
  const r = await requestReset(s, login);
  switch (r.status) {
    case "sent": return go({ login, enviado: "1", para: r.to });
    case "mail_off": return go({ login, erro: "mail_off" });
    case "rate": return go({ login, erro: "rate" });
    case "mail_error": return go({ login, erro: "mail_error", detalhe: r.message });
    // login inexistente ou sem e-mail: mesma resposta, para não revelar quem existe
    default: return go({ login, enviado: "1" });
  }
}
