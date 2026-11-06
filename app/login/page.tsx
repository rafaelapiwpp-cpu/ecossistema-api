import { redirect } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { BRAND } from "@/lib/brand";
import { hasDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";

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
        {sp.erro && <div className="err">E-mail ou senha incorretos</div>}
        <button className="btn primary" type="submit" style={{ justifyContent: "center" }}>Entrar</button>
        <div className="login-links"><a href="/esqueci-senha">Esqueci minha senha</a></div>
      </form>
    </div>
  );
}
