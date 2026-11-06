"use client";
import { useState } from "react";

/**
 * Interruptor "Acompanhar na Visão geral": lista pessoal de números (cada usuário monta a sua).
 * Com pelo menos um marcado, a Visão geral mostra só esses; sem nenhum, mostra todos.
 */
export default function WatchSwitch({ id, watched, compact = false, onChange }: { id: string; watched: boolean; compact?: boolean; onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(watched);
  const [busy, setBusy] = useState(false);
  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    const next = !on;
    setOn(next); setBusy(true);
    try {
      const r = await fetch("/api/numeros", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "watch", id, watched: next }) });
      if (!r.ok) throw new Error();
      onChange?.(next);
    } catch { setOn(!next); }
    finally { setBusy(false); }
  };
  return (
    <button type="button" className={`watch${on ? " on" : ""}${compact ? " compact" : ""}`} role="switch" aria-checked={on} onClick={toggle} disabled={busy}
      title={on ? "Este número aparece na sua Visão geral. Clique para tirar." : "Clique para acompanhar este número na sua Visão geral."}>
      <span className="watch-track" aria-hidden><span className="watch-knob" /></span>
      {!compact && <span className="watch-text">{on ? "Na Visão geral" : "Fora da Visão geral"}</span>}
    </button>
  );
}
