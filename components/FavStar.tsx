"use client";
import { useState } from "react";

/** Estrela para marcar um número (conta) como importante. Fica salvo até desmarcar. */
export default function FavStar({ id, featured, canEdit }: { id: string; featured: boolean; canEdit: boolean }) {
  const [on, setOn] = useState(featured);
  const [busy, setBusy] = useState(false);

  // quem não pode editar vê só a estrela cheia quando a conta é importante
  if (!canEdit) return on ? <span className="fav on static" title="Conta importante" aria-hidden>★</span> : <span className="fav-slot" aria-hidden />;

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      const r = await fetch("/api/numeros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "featured", id, featured: next }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setOn(!next); // reverte se falhar
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={`fav${on ? " on" : ""}`} onClick={toggle} aria-pressed={on} title={on ? "Remover destaque" : "Marcar como importante"}>
      <span aria-hidden>{on ? "★" : "☆"}</span>
    </button>
  );
}
