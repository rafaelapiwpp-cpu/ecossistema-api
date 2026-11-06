import { redirect } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { BRAND } from "@/lib/brand";
import { hasDb } from "@/lib/db";
import { getSession } from "@/lib/guard";
import { ROLE_LABEL } from "@/lib/roles";

export const dynamic = "force-dynamic";

const ERR: Record<string, string> = {
  curta: "A nova senha precisa ter pelo menos 8 caracteres.",
  confirmacao: "As duas senhas não conferem.",
  igual: "Escolha uma senha diferente da provisória.",
};

export default async function TrocarSenha({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (!hasDb()) redirect("/");
  const session = await getSession();
  if (!session) redirect("/login");
  const sp = await searchParams;
  const forced = Boolean(session.user.must_change_password);
  return (
    <div className="login">
      <form action="/api/senha" method="post" autoComplete="off">
        <div className="login-brand"><Wordmark /></div>
        <h1>{forced ? "Crie a sua senha" : "Trocar senha"}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {forced
            ? <>Olá, <b>{session.user.name}</b> ({ROLE_LABEL[session.user.role] || session.user.role}). Você entrou com uma senha provisória: defina agora a sua senha pessoal. A provisória deixa de funcionar.</>
            : <>Defina uma nova senha para <b>{session.user.name}</b>.</>}
        </p>
        <label className="field"><span>Nova senha (mín. 8 caracteres)</span><input type="password" name="password" minLength={8} required autoFocus autoComplete="new-password" /></label>
        <label className="field"><span>Confirmar nova senha</span><input type="password" name="password2" minLength={8} required autoComplete="new-password" /></label>
        {sp.erro && <div className="err">{ERR[sp.erro] || "Confira os campos."}</div>}
        <button className="btn primary" type="submit" style={{ justifyContent: "center" }}>Salvar e entrar</button>
        {!forced && <a className="muted" href="/" style={{ textAlign: "center", fontSize: 13 }}>Voltar</a>}
      </form>
    </div>
  );
}
