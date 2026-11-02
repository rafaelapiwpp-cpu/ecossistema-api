import Link from "next/link";
import type { PlatformPermission } from "@eco/core/security";
import { exigirOperador } from "@/lib/auth/sessao";
import { sair } from "@/app/login/actions";
import { SidebarNav } from "./SidebarNav";
import styles from "./AppShell.module.css";

/**
 * Moldura do painel admin: navegação lateral fixa + área de conteúdo.
 * Também é uma barreira: sem sessão válida redireciona para /login (as páginas
 * chamam exigirOperador() antes de buscar dados; isto cobre qualquer página nova).
 */
export async function AppShell({ children, permissao }: { children: React.ReactNode; permissao?: PlatformPermission }) {
  const op = await exigirOperador(permissao);
  const inicial = (op.nome.trim()[0] ?? "?").toUpperCase();
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span className={styles.brandText}>
            <span className={styles.brandName}>API Hub</span>
            <span className={styles.brandScope}>Painel admin</span>
          </span>
        </div>
        <SidebarNav />
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">
            {inicial}
          </span>
          <span className={styles.accountText}>
            <Link href="/conta/senha" className={styles.accountName} title="Login e senha">
              {op.nome}
            </Link>
            <span className={styles.accountRole}>{op.papelRotulo}</span>
          </span>
          <form action={sair} className={styles.accountExit}>
            <button type="submit" className={styles.exitButton}>
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
