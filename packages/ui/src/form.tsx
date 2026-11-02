import type { FormHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Glyph } from "./glyph";
import { cx } from "./cx";

/**
 * Formulário de cadastro: grade de 2 colunas (1 abaixo de 720px), campos com rótulo
 * sempre visível, ajuda/erro abaixo e ações no rodapé separadas por borda.
 */
export function Form({ className, children, ...rest }: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form className={cx("eco-form", className)} {...rest}>
      {children}
    </form>
  );
}

/** Título de grupo dentro do formulário (ocupa a linha inteira). */
export function FormSection({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="eco-form__section">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

/** Rodapé: `start` à esquerda (Cancelar), `children` à direita (primária por último). */
export function FormActions({ start, children }: { start?: ReactNode; children: ReactNode }) {
  return (
    <div className="eco-form__actions">
      {start}
      <div className="eco-form__actions-end">{children}</div>
    </div>
  );
}

export interface FieldProps {
  label: string;
  /** id do controle; liga o rótulo e a ajuda. */
  htmlFor: string;
  help?: ReactNode;
  /** Diz o que fazer, não só o que deu errado. */
  error?: string;
  optional?: boolean;
  /** Ocupa as duas colunas. */
  wide?: boolean;
  children: ReactNode;
}

export function Field({ label, htmlFor, help, error, optional, wide, children }: FieldProps) {
  return (
    <div className={cx("eco-field", wide && "eco-field--wide")}>
      <label className="eco-label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="eco-label__opt"> (opcional)</span>}
      </label>
      {children}
      {error ? (
        <span className="eco-help eco-help--error" id={`${htmlFor}-help`}>
          <Glyph name="alert" width={14} height={14} />
          {error}
        </span>
      ) : help ? (
        <span className="eco-help" id={`${htmlFor}-help`}>
          {help}
        </span>
      ) : null}
    </div>
  );
}

type Shared = { invalid?: boolean; mono?: boolean; leading?: ReactNode; trailing?: ReactNode };

function described(id: string | undefined, hasHelp: boolean | undefined) {
  return hasHelp && id ? `${id}-help` : undefined;
}

export function TextInput({
  invalid,
  mono,
  leading,
  trailing,
  className,
  hasHelp,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & Shared & { hasHelp?: boolean }) {
  return (
    <div className={cx("eco-input", mono && "eco-input--mono", invalid && "is-invalid", rest.disabled && "is-disabled", className)}>
      {leading}
      <input aria-invalid={invalid || undefined} aria-describedby={described(rest.id, hasHelp || invalid)} {...rest} />
      {trailing}
    </div>
  );
}

export function Select({
  invalid,
  className,
  hasHelp,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & Shared & { hasHelp?: boolean }) {
  return (
    <div className={cx("eco-input", "eco-input--select", invalid && "is-invalid", rest.disabled && "is-disabled", className)}>
      <select aria-invalid={invalid || undefined} aria-describedby={described(rest.id, hasHelp || invalid)} {...rest}>
        {children}
      </select>
      <Glyph name="chevron-down" />
    </div>
  );
}

export function Textarea({
  invalid,
  mono,
  className,
  hasHelp,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & Shared & { hasHelp?: boolean }) {
  return (
    <div className={cx("eco-input", "eco-input--textarea", mono && "eco-input--mono", invalid && "is-invalid", rest.disabled && "is-disabled", className)}>
      <textarea aria-invalid={invalid || undefined} aria-describedby={described(rest.id, hasHelp || invalid)} {...rest} />
    </div>
  );
}
