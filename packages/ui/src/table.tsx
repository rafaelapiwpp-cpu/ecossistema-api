import type { ReactNode } from "react";
import { cx } from "./cx";

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Números à direita, com tabular-nums. */
  align?: "left" | "right";
  /** `secondary` = texto em text-secondary; `actions` = coluna final de ações. */
  kind?: "secondary" | "actions";
  width?: number | string;
}

/**
 * Tabela densa do DS. Altura de linha vem da densidade (36px Admin, 44px Portal).
 * Primeira coluna identifica a linha (use `<Cell2>`); a última, ações (`kind: "actions"`).
 * Seleção em massa, ordenação e paginação entram como props quando uma tela precisar.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
  toolbar,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Mostrado no lugar da tabela quando não há linhas (`<EmptyState>`). */
  empty?: ReactNode;
  /** Legenda para leitores de tela. */
  caption?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="eco-card eco-table-card">
      {toolbar && <div className="eco-toolbar">{toolbar}</div>}
      {rows.length === 0 && empty ? (
        empty
      ) : (
        <div className="eco-table-scroll">
          <table className="eco-table">
            {caption && <caption className="eco-sr">{caption}</caption>}
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className={cx(c.align === "right" && "is-num", c.kind === "actions" && "is-actions")}
                    style={c.width !== undefined ? { width: c.width } : undefined}
                  >
                    {c.kind === "actions" && c.header === "" ? <span className="eco-sr">Ações</span> : c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      className={cx(c.align === "right" && "is-num", c.kind === "secondary" && "is-secondary", c.kind === "actions" && "is-actions")}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer && <div className="eco-table-foot">{footer}</div>}
    </section>
  );
}

/** Célula de identificação: principal + secundário (ID, domínio, prévia) em text-muted. */
export function Cell2({ primary, secondary, leading, mono }: { primary: ReactNode; secondary?: ReactNode; leading?: ReactNode; mono?: boolean }) {
  return (
    <div className="eco-cell2">
      {leading}
      <div className="eco-cell2__text">
        <span className="eco-cell2__primary">{primary}</span>
        {secondary && (
          <span className={cx("eco-cell2__secondary", mono && "eco-mono")}>
            {secondary}
          </span>
        )}
      </div>
    </div>
  );
}
