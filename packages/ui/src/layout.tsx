import type { ReactNode } from "react";
import { Glyph } from "./glyph";
import { cx } from "./cx";

/** Área de conteúdo da página. `narrow` (960px) para cadastros. */
export function Page({ narrow, children }: { narrow?: boolean; children: ReactNode }) {
  return <div className={cx("eco-page", narrow && "eco-page--narrow")}>{children}</div>;
}

/**
 * Cabeçalho da página: título, subtítulo e ações à direita (uma primária).
 * `back` recebe o link já pronto do framework, ex.: `<Link className="eco-back" href="/bms">…</Link>`;
 * use `<BackLabel>` dentro dele para o ícone.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="eco-page__head">
      <div>
        {back}
        <h1 className="eco-page__title">{title}</h1>
        {subtitle && <p className="eco-page__sub">{subtitle}</p>}
      </div>
      {actions && <div className="eco-page__actions">{actions}</div>}
    </header>
  );
}

export function BackLabel({ children }: { children: ReactNode }) {
  return (
    <>
      <Glyph name="chevron-left" />
      {children}
    </>
  );
}

/** Superfície: card com borda sutil. `flush` tira o padding (tabelas, formulários). */
export function Card({ flush, className, children }: { flush?: boolean; className?: string; children: ReactNode }) {
  return <section className={cx("eco-card", flush ? "eco-table-card" : "eco-card--padded", className)}>{children}</section>;
}

/** Vazio: ícone, uma frase que explica e a ação que resolve. */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="eco-empty">
      {icon && <span className="eco-empty__icon">{icon}</span>}
      <strong>{title}</strong>
      {children && <span>{children}</span>}
      {action}
    </div>
  );
}
