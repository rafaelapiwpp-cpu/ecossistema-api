import { redirect } from "next/navigation";
import SubmitOnce from "@/components/SubmitOnce";
import Wordmark from "@/components/Wordmark";
import { BRAND } from "@/lib/brand";
import { hasDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { LOCK_MINUTES } from "@/lib/login-guard";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (!hasDb()) redirect("/");
  if (!(await getSettings())) redirect("/setup");
  const sp = await searchParams;
  return (
    <div className="login">
      {/* nada da sessão anterior fica no navegador (catálogo em cache etc.) */}
      <script dangerouslySetInnerHTML={{ __html: "try{for(var k in sessionStorage)if(k.indexOf('hub.')===0)sessionStorage.removeItem(k)}catch(e){}" }} />
      <form action="/api/login" method="post">
        <div className="login-brand"><Wordmark /></div>
        <h1>Entrar</h1>
        <label className="field"><span>E-mail (ou usuário)</span><input type="text" name="login" placeholder="voce@empresa.com" required autoFocus autoComplete="username" /></label>
        <label className="field"><span>Senha</span><input type="password" name="password" required autoComplete="current-password" /></label>
        {sp.erro && <div className="err">{sp.erro === "bloqueado" ? `Muitas tentativas erradas. Aguarde ${LOCK_MINUTES} minutos e tente de novo.` : "E-mail ou senha incorretos"}</div>}
        <SubmitOnce className="btn primary" style={{ justifyContent: "center" }} pending="Entrando…">Entrar</SubmitOnce>
        <div className="login-links"><a href="/esqueci-senha">Esqueci minha senha</a></div>
      </form>
    </div>
  );
}
