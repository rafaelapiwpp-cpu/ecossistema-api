"use client";
// Lista lateral de automações (pastas por conta), miniatura do fluxo e criação de fluxo.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/Campaigns";
import { FLOW_STATUS } from "@/lib/flow-shared";
import { BLOCK, type Catalog } from "./shared";
import { FIcon } from "./icons";

export type FlowRow = {
  id: number; name: string; waba_id: string; phone_number_id: string; status: string; last_error: string | null; created_at: string; updated_at: string;
  blocks: number; counts: Record<string, number>; last_activity: string | null; display_phone_number: string | null; phone_name: string | null; waba_name: string | null;
  created_by_name: string | null; description: string | null; has_trigger?: boolean; thumb_nodes: { id: string; type: string; x: number; y: number }[]; thumb_edges: { from: string; to: string }[];
};

export function useFlowRows() {
  const [rows, setRows] = useState<FlowRow[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api("/api/fluxos").then((j) => { setRows(j.rows); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return { rows, err, reload: load };
}

const FOLDERS_KEY = "hub.flows.folders";
const SIDE_KEY = "hub.flows.side";

export function useSideCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let v: string | null = null;
    try { v = localStorage.getItem(SIDE_KEY); } catch { /* sem armazenamento */ }
    setCollapsed(v ? v === "min" : window.matchMedia("(max-width: 900px)").matches);
  }, []);
  const set = (c: boolean) => { setCollapsed(c); try { localStorage.setItem(SIDE_KEY, c ? "min" : "full"); } catch { /* ignorado */ } };
  return [collapsed, set] as const;
}

export function folderOf(r: { waba_name: string | null; waba_id: string }) {
  return (r.waba_name || `Conta ${r.waba_id}`).trim();
}

/** Coluna "Automações": busca, nova automação e pastas (uma por conta) com os fluxos. */
export function AutomationsSidebar({ rows, currentId, canEdit, onNew, onOpen, collapsed, setCollapsed }: {
  rows: FlowRow[] | null; currentId?: number; canEdit: boolean; onNew: () => void; onOpen: (id: number) => void; collapsed: boolean; setCollapsed: (c: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [onlyOn, setOnlyOn] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setOpen(JSON.parse(localStorage.getItem(FOLDERS_KEY) || "{}")); } catch { /* ignorado */ } }, []);
  const current = rows?.find((r) => r.id === currentId);
  const groups = useMemo(() => {
    const map = new Map<string, FlowRow[]>();
    const needle = q.trim().toLowerCase();
    for (const r of rows || []) {
      if (onlyOn && r.status !== "active") continue;
      if (needle && !r.name.toLowerCase().includes(needle)) continue;
      const k = folderOf(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([name, list]) => ({ name, list: list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) }));
  }, [rows, q, onlyOn]);
  const isOpen = (name: string) => (q.trim() || onlyOn ? true : open[name] ?? (current ? folderOf(current) === name : groups.length <= 2));
  const toggle = (name: string) => {
    const next = { ...open, [name]: !isOpen(name) };
    setOpen(next);
    try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(next)); } catch { /* ignorado */ }
  };
  return (
    <>
      <aside className={`fside${collapsed ? " min" : ""}`} aria-label="Automações">
        <div className="fside-head"><h2>Automações</h2></div>
        <div className="fside-search">
          <FIcon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar automação" aria-label="Buscar automação" />
          <button type="button" className={onlyOn ? "on" : ""} onClick={() => setOnlyOn(!onlyOn)} data-tip={onlyOn ? "Mostrando só as ativas" : "Só as ativas"} aria-pressed={onlyOn} aria-label="Mostrar só automações ativas"><FIcon name="power" size={15} stroke={2} /></button>
        </div>
        {canEdit && <button type="button" className="fside-new" onClick={onNew}><FIcon name="plus" size={16} stroke={2.2} />Adicionar automação</button>}
        <nav className="fside-list">
          {!rows && <div className="fside-empty">Carregando…</div>}
          {rows && !groups.length && <div className="fside-empty">{q || onlyOn ? "Nada encontrado." : "Nenhuma automação ainda."}</div>}
          {groups.map((g) => (
            <div key={g.name} className="fside-folder">
              <button type="button" className="fside-folder-h" onClick={() => toggle(g.name)} aria-expanded={isOpen(g.name)}>
                <span>{g.name}</span><em>{g.list.length}</em><FIcon name={isOpen(g.name) ? "chevronDown" : "chevronRight"} size={15} stroke={2} />
              </button>
              {isOpen(g.name) && g.list.map((r) => (
                <button key={r.id} type="button" className={`fside-item${r.id === currentId ? " on" : ""}`} onClick={() => onOpen(r.id)} title={r.name}>
                  {r.has_trigger ? <span title="Inicia sozinho quando recebe mensagem (gatilho)" style={{ display: "inline-flex" }}><FIcon name="bubble" size={15} /></span> : <FIcon name="flow" size={15} />}
                  <span className="fside-name">{r.name}</span>
                  <span className={`fside-st ${r.status}`} title={FLOW_STATUS[r.status] || r.status}><FIcon name={r.status === "active" ? "power" : "powerOff"} size={14} stroke={2} /></span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <button type="button" className={`fside-toggle${collapsed ? " min" : ""}`} onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Mostrar automações" : "Esconder automações"} data-tip={collapsed ? "Mostrar automações" : "Esconder automações"}>
        <FIcon name={collapsed ? "chevronRight" : "arrowLeft"} size={16} stroke={2.2} />
      </button>
    </>
  );
}

/** Miniatura do fluxo (blocos e ligações), como nos cartões de automação. */
export function FlowThumb({ nodes, edges }: { nodes: FlowRow["thumb_nodes"]; edges: FlowRow["thumb_edges"] }) {
  if (!nodes?.length) return <div className="fthumb empty"><FIcon name="flow" size={26} /></div>;
  const W = 300, H = 92; // tamanho de um bloco no canvas (aprox.)
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs) - 40, minY = Math.min(...ys) - 40, maxX = Math.max(...xs) + W + 40, maxY = Math.max(...ys) + H + 120;
  const vw = Math.max(maxX - minX, 900), vh = Math.max(maxY - minY, 560);
  const ox = (minX + maxX) / 2 - vw / 2, oy = (minY + maxY) / 2 - vh / 2; // centraliza fluxos pequenos
  const by = new Map(nodes.map((n) => [n.id, n]));
  return (
    <svg className="fthumb" viewBox={`${ox} ${oy} ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {edges.map((e, i) => {
        const a = by.get(e.from), b = by.get(e.to);
        if (!a || !b) return null;
        const x1 = a.x + W, y1 = a.y + 70, x2 = b.x, y2 = b.y + 26, mx = (x1 + x2) / 2;
        return <path key={i} d={`M${x1} ${y1} H${mx} V${y2} H${x2}`} className="fthumb-e" />;
      })}
      {nodes.map((n) => (
        <g key={n.id}>
          <rect x={n.x} y={n.y} width={W} height={H + 70} rx={18} className="fthumb-n" />
          <rect x={n.x + 18} y={n.y + 18} width={22} height={22} rx={6} fill={BLOCK[n.type as keyof typeof BLOCK]?.color || "#8e8e93"} opacity={0.9} />
          <rect x={n.x + 50} y={n.y + 22} width={140} height={14} rx={7} className="fthumb-t" />
          <rect x={n.x + 18} y={n.y + 56} width={W - 36} height={44} rx={10} className="fthumb-i" />
        </g>
      ))}
    </svg>
  );
}

/** Janela "Nova automação": nome, descrição, conta (pasta) e número. */
export function NewFlowModal({ catalog, presetList, presetWaba, onClose, onCreated }: { catalog: Catalog; presetList?: number | null; presetWaba?: string | null; onClose: () => void; onCreated: (id: number) => void }) {
  const preset = presetList ? catalog.lists.find((l) => l.id === presetList) : undefined;
  const [form, setForm] = useState({ name: preset ? `Fluxo — ${preset.name}` : "", description: "", waba_id: (preset?.waba_id as string) || presetWaba || catalog.wabas[0]?.id || "", phone_number_id: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const phones = catalog.phones.filter((p) => p.waba_id === form.waba_id);
  useEffect(() => { if (!phones.find((p) => p.id === form.phone_number_id)) setForm((f) => ({ ...f, phone_number_id: phones[0]?.id || "" })); }, [form.waba_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => {
    setBusy(true); setErr("");
    try { const j = await api("/api/fluxos", { action: "create", ...form, list_ids: presetList ? [presetList] : [] }); onCreated(j.id); } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="panel-head"><h2 style={{ margin: 0 }}>Nova automação</h2><button className="btn icon" onClick={onClose} aria-label="Fechar">×</button></div>
        {err && <div className="banner err">{err}</div>}
        <div className="grid" style={{ gap: 12 }}>
          <label className="field"><span>Nome</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex.: DISPARO LEME 7K - MNI" autoFocus /></label>
          <label className="field"><span>Descrição (opcional)</span><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="ex.: Mensagem inicial para os leads do formulário" maxLength={240} /></label>
          <div className="kv-row">
            <label className="field"><span>Pasta (conta)</span><select value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value })}>{catalog.wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}</select></label>
            <label className="field"><span>Número de envio</span><select value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })}>{phones.map((p) => <option key={p.id} value={p.id}>{p.label ? `${p.label} · ` : ""}{p.verified_name || p.display_phone_number} ({p.display_phone_number})</option>)}{!phones.length && <option value="">Nenhum número nesta conta</option>}</select></label>
          </div>
          {preset && <div className="notice">O bloco Início já vai sair com o público da lista <b>{preset.name}</b> ({preset.total ?? 0} leads).</div>}
        </div>
        <div className="wizard-foot"><button className="btn" onClick={onClose} disabled={busy}>Cancelar</button><span style={{ flex: 1 }} /><button className="btn primary" onClick={create} disabled={busy || !form.name.trim() || !form.phone_number_id}>{busy ? "Criando…" : "Criar e montar"}</button></div>
      </div>
    </div>
  );
}
