"use client";
// Painel do contato (Atendimento): em que etapa de cada funil o contato está, com troca direta.
// Só aparece quando o contato é de uma empresa com funil (portal de clientes).
import { useCallback, useEffect, useState } from "react";
import { Section } from "./Inbox";

type Stage = { id: number; name: string; color: string | null; kind: string };
type Pipe = { id: number; name: string; stages: Stage[]; card: { stage_id: number } | null };

export default function FunnelSection({ contactId }: { contactId: number }) {
  const [pipes, setPipes] = useState<Pipe[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/funil?contact=${contactId}`, { cache: "no-store" });
      const j = await r.json();
      setPipes(r.ok ? j.pipelines || [] : []);
    } catch { setPipes([]); }
  }, [contactId]);
  useEffect(() => { setPipes(null); load(); }, [load]);
  if (!pipes || !pipes.length) return null;

  const move = async (p: Pipe, stageId: string) => {
    setBusy(true);
    try {
      const body = stageId ? { action: "move", pipeline_id: p.id, contact_id: contactId, stage_id: Number(stageId) } : { action: "remove", pipeline_id: p.id, contact_id: contactId };
      await fetch("/api/funil", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await load();
    } finally { setBusy(false); }
  };
  return (
    <Section id="funil" title="Funil" icon="leads" count={pipes.filter((p) => p.card).length || undefined}>
      {pipes.map((p) => {
        const cur = p.stages.find((s) => s.id === p.card?.stage_id);
        return (
          <label key={p.id} className="at-f">
            <span>{p.name}{cur && <i className="fs-dot" style={{ background: cur.color || "var(--accent)" }} />}</span>
            <select value={p.card?.stage_id || ""} onChange={(e) => move(p, e.target.value)} disabled={busy}>
              <option value="">Fora do funil</option>
              {p.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        );
      })}
    </Section>
  );
}
