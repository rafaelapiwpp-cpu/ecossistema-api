import { redirect } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { BRAND } from "@/lib/brand";
import { hasDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { CODE_MINUTES } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

type SP = { login?: string; enviado?: string; para?: string; erro?: string; detalhe?: string };

const ERR: Record<string, string> = {
  login: "Informe o seu login.",
  codigo: "Código inválido ou vencido. Confira os 6 dígitos ou peça um código novo.",
  curta: "A nova senha precisa ter pelo menos 8 caracteres.",
  confirmacao: "As duas senhas não conferem.",
  rate: "Você já pediu vários códigos há pouco. Aguarde alguns minutos e tente de novo.",
  mail_off: "O envio de e-mail ainda não foi configurado neste sistema. Peça ao Master para configurar em Configurações → E-mail.",
  mail_error: "Não foi possível enviar o e-mail agora.",
};

export default async function EsqueciSenha({ searchParams }: { searchParams: Promise<SP> }) {
  if (!hasDb()) redirect("/");
  if (!(await getSettings())) redirect("/setup");
  const sp = await searchParams;
  const login = (sp.login || "").slice(0, 200);
  const sent = sp.enviado === "1";
  const err = sp.erro ? (ERR[sp.erro] || "Confira os campos.") + (sp.erro === "mail_error" && sp.detalhe ? ` (${sp.detalhe})` : "") : "";

  return (
    <div className="login">
      {sent ? (
        <form action="/api/senha/redefinir" method="post" autoComplete="off">
          <div className="login-brand"><Wordmark /></div>
          <h1>Digite o código</h1>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            {sp.para
              ? <>Enviamos um código de 6 dígitos para <b>{sp.para}</b>. Ele vale por {CODE_MINUTES} minutos.</>
              : <>Se o login <b>{login}</b> existir e tiver um e-mail de recuperação, enviamos um código de 6 dígitos para ele. Ele vale por {CODE_MINUTES} minutos.</>}
          </p>
          <input type="hidden" name="login" value={login} />
          <label className="field"><span>Código recebido</span><input name="code" inputMode="numeric" pattern="[0-9 ]*" maxLength={7} placeholder="000000" required autoFocus autoComplete="one-time-code" style={{ letterSpacing: ".2em", fontWeight: 600 }} /></label>
          <label className="field"><span>Nova senha (mín. 8 caracteres)</span><input type="password" name="password" minLength={8} required autoComplete="new-password" /></label>
          <label className="field"><span>Confirmar nova senha</span><input type="password" name="password2" minLength={8} required autoComplete="new-password" /></label>
          {err && <div className="err">{err}</div>}
          <button className="btn primary" type="submit" style={{ justifyContent: "center" }}>Salvar senha e entrar</button>
          <div className="login-links">
            <a href={`/esqueci-senha?login=${encodeURIComponent(login)}`}>Pedir outro código</a>
            <a href="/login">Voltar ao login</a>
          </div>
        </form>
      ) : (
        <form action="/api/senha/recuperar" method="post" autoComplete="off">
          <div className="login-brand"><Wordmark /></div>
          <h1>Esqueci minha senha</h1>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>Informe o seu login. Enviaremos um código para o e-mail de recuperação cadastrado, e com ele você cria uma senha nova.</p>
          <label className="field"><span>E-mail (ou usuário)</span><input type="text" name="login" defaultValue={login} placeholder="voce@empresa.com" required autoFocus autoComplete="username" /></label>
          {err && <div className="err">{err}</div>}
          <button className="btn primary" type="submit" style={{ justifyContent: "center" }}>Enviar código</button>
          <div className="login-links"><a href="/login">Voltar ao login</a></div>
        </form>
      )}
    </div>
  );
}
