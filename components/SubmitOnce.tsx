"use client";
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";

/**
 * Botão de envio para formulários comuns (action="/api/..."): ao enviar, trava e mostra o texto de espera,
 * para ninguém clicar de novo achando que travou. Voltar pelo histórico destrava.
 */
export default function SubmitOnce({ children, pending = "Aguarde…", disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { pending?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = (e: Event) => { if (!e.defaultPrevented) setBusy(true); };
    const onShow = () => setBusy(false);
    form.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onShow);
    return () => { form.removeEventListener("submit", onSubmit); window.removeEventListener("pageshow", onShow); };
  }, []);
  return (
    <button ref={ref} type="submit" {...rest} disabled={disabled || busy} aria-busy={busy}>
      {busy ? pending : children}
    </button>
  );
}
