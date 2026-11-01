import { SidebarNav } from "./SidebarNav";
import styles from "./AppShell.module.css";

/** Moldura do painel admin: navegação lateral fixa + área de conteúdo. */
export function AppShell({ children }: { children: React.ReactNode }) {
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
            R
          </span>
          <span className={styles.accountText}>
            <span className={styles.accountName}>Rafael</span>
            <span className={styles.accountRole}>Superadmin</span>
          </span>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
