"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton({ demo, days = 7, label = "Sincronizar agora", primary = true }: { demo: boolean; days?: number; label?: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  async function run() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/sync?days=${days}`, { method: "POST" });
      const j = await r.json();
      const fails = (j.log || []).filter((l: any) => !l.ok).length;
      setMsg(r.ok ? "Atualizado" : j.error || `${fails} etapa(s) com erro — veja em Contas`);
      router.refresh();
    } catch { setMsg("Falhou"); }
    setBusy(false);
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button className={primary ? "btn primary" : "btn"} onClick={run} disabled={busy || demo} title={demo ? "Disponível depois de conectar o banco" : ""}>
        {busy ? "Sincronizando…" : label}
      </button>
      {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
    </span>
  );
}
