import nodemailer from "nodemailer";
import type { Settings } from "./settings";
import { BRAND } from "./brand";

/**
 * Envio de e-mail do sistema (hoje: código de "Esqueci minha senha").
 * Configuração em duas camadas: variáveis HUB_MAIL_* na Vercel (só o dono do projeto mexe) têm prioridade;
 * sem elas, valem os campos salvos em Configurações (só o Master edita). Padrão pronto para o Gmail com senha de app.
 */
export type MailConfig = { from: string; user: string; pass: string; host: string; port: number; source: "env" | "settings" };

const env = (k: string) => (process.env[k] || "").trim();

export function mailConfig(s: Settings | null): MailConfig | null {
  const e = { from: env("HUB_MAIL_FROM"), user: env("HUB_MAIL_USER"), pass: env("HUB_MAIL_PASS"), host: env("HUB_MAIL_HOST"), port: Number(env("HUB_MAIL_PORT")) || 0 };
  if (e.from && e.pass) return { from: e.from, user: e.user || e.from, pass: e.pass, host: e.host || "smtp.gmail.com", port: e.port || 465, source: "env" };
  const from = (s?.mail_from || "").trim(), pass = s?.mail_pass || "";
  if (from && pass) return { from, user: (s?.mail_user || "").trim() || from, pass, host: (s?.mail_host || "").trim() || "smtp.gmail.com", port: Number(s?.mail_port) || 465, source: "settings" };
  return null;
}

/** true quando as variáveis da Vercel estão em uso (os campos das Configurações ficam só de leitura). */
export const mailFromEnv = () => Boolean(env("HUB_MAIL_FROM") && env("HUB_MAIL_PASS"));

export const isEmail = (v: string | null | undefined) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());

/** fulano@gmail.com → fu•••••@gmail.com */
export function maskEmail(v: string) {
  const [u, d] = v.split("@");
  if (!d) return "•••";
  return `${u.slice(0, 2)}${"•".repeat(Math.max(3, Math.min(u.length - 2, 7)))}@${d}`;
}

export async function sendMail(cfg: MailConfig, to: string, subject: string, text: string, html?: string) {
  const t = nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
  });
  await t.sendMail({ from: { name: BRAND.name, address: cfg.from }, to, subject, text, html: html || text.replace(/\n/g, "<br>") });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** E-mail com o código de redefinição de senha. */
export function resetCodeMail(name: string, code: string, minutes: number) {
  const subject = `${code} é o seu código para redefinir a senha do ${BRAND.name}`;
  const text = `Olá, ${name}.\n\nSeu código para redefinir a senha do ${BRAND.name} é: ${code}\n\nEle vale por ${minutes} minutos e só funciona uma vez. Se você não pediu essa redefinição, ignore este e-mail: a sua senha continua a mesma.\n\n${BRAND.name}`;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:28px 20px;color:#1c1b22">
  <p style="margin:0 0 14px;font-size:15px">Olá, <b>${esc(name)}</b>.</p>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.5">Seu código para redefinir a senha do ${esc(BRAND.name)}:</p>
  <div style="font-size:34px;font-weight:700;letter-spacing:.28em;text-align:center;padding:18px 12px;border-radius:14px;background:#f1effc;color:#3b2bb0;margin:0 0 18px">${code}</div>
  <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#55536a">Ele vale por ${minutes} minutos e só funciona uma vez. Se você não pediu essa redefinição, ignore este e-mail: a sua senha continua a mesma.</p>
  <p style="margin:18px 0 0;font-size:12px;color:#8b899c">${esc(BRAND.name)}</p>
</div>`;
  return { subject, text, html };
}
