import { redirect } from "next/navigation";
import { destinoSeguro, operadorAtual } from "@/lib/auth/sessao";
import { entrar } from "./actions";
import s from "@/components/ui/crud.module.css";
import l from "./login.module.css";

export const metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

const ERROS: Record<string, string> = {
  vazio: "Informe login e senha.",
  credenciais: "Login ou senha incorretos, ou acesso bloqueado por tentativas demais. Confira e tente de novo em alguns minutos.",
  limite: "Muitas tentativas a partir desta rede. Aguarde 15 minutos e tente de novo.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const de = destinoSeguro(typeof sp.de === "string" ? sp.de : "/");
  if (await operadorAtual()) redirect(de);

  const erro = typeof sp.erro === "string" ? ERROS[sp.erro] : undefined;
  const saiu = sp.saiu === "1";

  return (
    <main className={l.wrap}>
      <div className={l.card}>
        <div className={l.brand}>
          <span className={l.mark} aria-hidden="true" />
          <span>
            <span className={l.brandName}>API Hub</span>
            <span className={l.brandScope}>Painel admin</span>
          </span>
        </div>
        <h1 className={l.title}>Entrar no painel</h1>
        <p className={l.sub}>Acesso restrito à operação da plataforma.</p>

        {erro && (
          <p role="alert" className={l.erro}>
            {erro}
          </p>
        )}
        {saiu && !erro && <p className={l.info}>Você saiu do painel.</p>}

        <form action={entrar} className={l.form}>
          <input type="hidden" name="de" value={de} />
          <div className={s.field}>
            <label className={s.label} htmlFor="login">Login</label>
            <input id="login" name="login" autoComplete="username" required autoFocus className={s.input} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="senha">Senha</label>
            <input id="senha" name="senha" type="password" autoComplete="current-password" required className={s.input} />
          </div>
          <button type="submit" className={`${s.btn} ${s.btnPrimary} ${l.submit}`}>Entrar</button>
        </form>
      </div>
    </main>
  );
}
