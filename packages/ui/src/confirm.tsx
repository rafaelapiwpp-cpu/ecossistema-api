"use client";

import { useState } from "react";
import { buttonClass, type ButtonSize } from "./actions";

/**
 * Ação destrutiva em dois passos, sem modal: o clique troca o botão por
 * "Excluir “Nome”? [Excluir] [Cancelar]". Só o segundo clique envia o formulário.
 * `action` é a server action (ou função) que recebe o FormData com `fields`.
 */
export function ConfirmAction({
  action,
  fields,
  target,
  label = "Excluir",
  confirmLabel,
  look = "ghost",
  size = "sm",
  icon,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** Campos ocultos enviados (ex.: `{ id }`). */
  fields: Record<string, string>;
  /** Nome do alvo, repetido na pergunta. */
  target: string;
  label?: string;
  /** Texto do botão final. Padrão: o mesmo `label`. */
  confirmLabel?: string;
  /** `ghost` em linhas de tabela; `button` no cabeçalho da página. */
  look?: "ghost" | "button";
  size?: ButtonSize;
  icon?: React.ReactNode;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        className={buttonClass({ variant: look === "ghost" ? "danger-ghost" : "secondary", size })}
        onClick={() => setAsking(true)}
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <span className="eco-confirm" role="group" aria-label={`Confirmar: ${label.toLowerCase()} ${target}`}>
      <span>
        {label} <b>{target}</b>?
      </span>
      <form action={action}>
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button type="submit" className={buttonClass({ variant: "danger", size: "sm" })} autoFocus>
          {confirmLabel ?? label}
        </button>
      </form>
      <button type="button" className={buttonClass({ variant: "ghost", size: "sm" })} onClick={() => setAsking(false)}>
        Cancelar
      </button>
    </span>
  );
}
