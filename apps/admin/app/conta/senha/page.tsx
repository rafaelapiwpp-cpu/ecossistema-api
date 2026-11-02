import { exigirOperador } from "@/lib/auth/sessao";
import { sair } from "@/app/login/actions";
import { trocarSenha } from "./actions";
import s from "@/components/ui/crud.module.css";
import l from "@/app/login/login.module.css";

export const metadata = { title: "Login e senha" };
export const dynamic = "force-dynamic";

export default async function TrocarSenhaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const op = await exigirOperador(undefined, { permitirTrocaPendente: true });
  const sp = await searchParams;
  const erro = typeof sp.erro === "string" ? sp.erro.slice(0, 200) : undefined;

  return (
    <main className={l.wrap}>
      <div className={`${l.card} ${l.cardWide}`}>
        <h1 className={l.title}>{op.precisaTrocarSenha ? "Defina seu acesso" : "Login e senha"}</h1>
        <p className={l.sub}>
          {op.precisaTrocarSenha
            ? "Você entrou com uma senha temporária. Escolha seu login definitivo e uma senha nova para continuar."
            : "Ao salvar, todas as outras sessões abertas com este login são encerradas."}
        </p>

        {erro && (
          <p role="alert" className={l.erro}>
            {erro}
          </p>
        )}

        <form action={trocarSenha} className={l.form}>
          <div className={s.field}>
            <label className={s.label} htmlFor="login">Login (seu e-mail, de preferência)</label>
            <input id="login" name="login" autoComplete="username" required defaultValue={op.login === "dono" ? "" : op.login} className={s.input} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="nome">Nome</label>
            <input id="nome" name="nome" autoComplete="name" required defaultValue={op.nome} className={s.input} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="atual">Senha atual</label>
            <input id="atual" name="atual" type="password" autoComplete="current-password" required className={s.input} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="nova">Nova senha</label>
            <input id="nova" name="nova" type="password" autoComplete="new-password" required minLength={12} className={s.input} />
          </div>
          <div className={s.field}>
            <label className={s.label} htmlFor="confirma">Confirme a nova senha</label>
            <input id="confirma" name="confirma" type="password" autoComplete="new-password" required minLength={12} className={s.input} />
          </div>
          <ul className={l.lista}>
            <li>Pelo menos 12 caracteres. Uma frase longa funciona bem.</li>
            <li>Não pode conter o seu login.</li>
          </ul>
          <button type="submit" className={`${s.btn} ${s.btnPrimary} ${l.submit}`}>Salvar e continuar</button>
        </form>
        <form action={sair} style={{ marginTop: "var(--s4)", textAlign: "center" }}>
          <button type="submit" className={s.link}>Sair</button>
        </form>
      </div>
    </main>
  );
}
