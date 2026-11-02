import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Classes do botão, para usar em links do framework (ex.: `<Link className={buttonClass({ variant: "primary" })}>`).
 * Uma `primary` por região; `danger` só para ação destrutiva (com confirmação).
 */
export function buttonClass({
  variant = "secondary",
  size = "md",
  iconOnly = false,
  loading = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean; loading?: boolean; className?: string } = {}): string {
  return cx(
    "eco-btn",
    `eco-btn--${variant}`,
    size !== "md" && `eco-btn--${size}`,
    iconOnly && "eco-btn--icon",
    loading && "is-loading",
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ícone à esquerda (16px), vindo do app. */
  icon?: ReactNode;
  /** Só ícone: exige `aria-label`. */
  iconOnly?: boolean;
  loading?: boolean;
}

export function Button({ variant, size, icon, iconOnly, loading, className, type = "button", children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, iconOnly, loading, className })}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon}
      {iconOnly ? null : children}
    </button>
  );
}

/** Grupo de ações no fim da linha da tabela. */
export function RowActions({ children }: { children: ReactNode }) {
  return <span className="eco-row-actions">{children}</span>;
}
