"use client";
// Tela Leads: cartões de Tags e Departamentos — quantos contatos tem cada um, criar, renomear, excluir
// e clicar para abrir (e gerenciar) esses contatos logo abaixo.
import { useState } from "react";
import { api, nf, type Catalog, type Filters } from "@/components/contacts/shared";

export type Counts = { total: number; lists: Record<string, number>; tags: Record<string, number>; departments: Record<string, number>; without: { tag: number; department: number } };
type Item = { id: number; name: string; color?: string | null };

export default function Groups({ catalog, counts, focus, onFocus, onChanged }: {
  catalog: Catalog; counts: Counts | null; focus: Partial<Filters>; onFocus: (f: Partial<Filters>) => void; onChanged: () => void;
}) {
  const manager = ["master", "admin", "gestor"].includes(catalog.me.role);
  return (
    <div className="lg-groups">
      <Card kind="tag" title="Tags" hint="Marque contatos (inclusive os que chegam conversando) para escolher no Início do fluxo e nos disparos."
        items={catalog.tags.filter((t) => t.company_id == null)} count={(id) => counts?.tags[id] ?? 0} none={counts?.without.tag}
        active={focus.tag} onPick={(v) => onFocus(v ? { tag: v } : {})} canCreate canDelete={manager} onChanged={onChanged} />
      <Card kind="department" title="Departamentos" hint="Quem atende cada contato. Também filtra o público dos fluxos e disparos."
        items={catalog.departments.filter((d) => d.company_id == null)} count={(id) => counts?.departments[id] ?? 0} none={counts?.without.department}
        active={focus.department} onPick={(v) => onFocus(v ? { department: v } : {})} canCreate={manager} canDelete={manager} onChanged={onChanged} />
    </div>
  );
}

function Card({ kind, title, hint, items, count, none, active, onPick, canCreate, canDelete, onChanged }: {
  kind: "tag" | "department"; title: string; hint: string; items: Item[]; count: (id: number) => number; none?: number;
  active?: string; onPick: (v: string) => void; canCreate: boolean; canDelete: boolean; onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const noun = kind === "tag" ? "tag" : "departamento";
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(""); try { await fn(); onChanged(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const create = () => run(async () => {
    await api("/api/contatos", { action: kind === "tag" ? "create_tag" : "create_department", name: name.trim() });
    setName(""); setAdding(false);
  });
  const save = (it: Item) => run(async () => {
    await api("/api/equipe", { action: kind === "tag" ? "tag_save" : "department_save", id: it.id, name: it.name.trim(), color: it.color || null });
    setEdit(null);
  });
  const remove = (it: Item) => {
    if (!confirm(`Excluir ${kind === "tag" ? "a tag" : "o departamento"} “${it.name}”? ${nf(count(it.id))} contato(s) perdem ${kind === "tag" ? "essa tag" : "esse departamento"} (os contatos continuam).`)) return;
    run(async () => { await api("/api/equipe", { action: kind === "tag" ? "tag_delete" : "department_delete", id: it.id }); if (active === String(it.id)) onPick(""); setEdit(null); });
  };
  return (
    <div className="card lg-card">
      <div className="lg-card-head">
        <b>{title}</b><span className="muted">{hint}</span>
        {canCreate && !adding && <button type="button" className="btn" onClick={() => setAdding(true)}>+ {kind === "tag" ? "Nova tag" : "Novo departamento"}</button>}
      </div>
      {adding && (
        <div className="lg-add">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "tag" ? "Nome da tag (ex.: VIP, Comprou em outubro)" : "Nome do departamento (ex.: Vendas)"} maxLength={60}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create(); if (e.key === "Escape") setAdding(false); }} />
          <button type="button" className="btn primary" disabled={busy || !name.trim()} onClick={create}>Criar</button>
          <button type="button" className="link" onClick={() => { setAdding(false); setName(""); }}>cancelar</button>
        </div>
      )}
      {err && <div className="err" style={{ fontSize: 12.5 }}>{err}</div>}
      <div className="lg-chips">
        {items.map((it) => edit?.id === it.id ? (
          <span key={it.id} className="lg-edit">
            <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={60} onKeyDown={(e) => { if (e.key === "Enter" && edit.name.trim()) save(edit); if (e.key === "Escape") setEdit(null); }} />
            {kind === "tag" && <input type="color" value={edit.color || "#8b7cf6"} onChange={(e) => setEdit({ ...edit, color: e.target.value })} aria-label="Cor da tag" />}
            <button type="button" className="btn primary" disabled={busy || !edit.name.trim()} onClick={() => save(edit)}>Salvar</button>
            {canDelete && <button type="button" className="btn danger" disabled={busy} onClick={() => remove(it)}>Excluir</button>}
            <button type="button" className="link" onClick={() => setEdit(null)}>cancelar</button>
          </span>
        ) : (
          <span key={it.id} className={`lg-chip${active === String(it.id) ? " on" : ""}`}>
            <button type="button" onClick={() => onPick(active === String(it.id) ? "" : String(it.id))} title={`Ver e gerenciar os contatos com ${kind === "tag" ? "a tag" : "o departamento"} “${it.name}”`}>
              {kind === "tag" && <i style={{ background: it.color || "var(--accent)" }} aria-hidden />}{it.name}<em className="num">{nf(count(it.id))}</em>
            </button>
            <button type="button" className="lg-pen" onClick={() => setEdit({ ...it })} aria-label={`Renomear ${it.name}`} title="Renomear / excluir">✎</button>
          </span>
        ))}
        {none != null && (
          <span className={`lg-chip none${active === "none" ? " on" : ""}`}>
            <button type="button" onClick={() => onPick(active === "none" ? "" : "none")} title={`Contatos sem ${noun} — bom ponto de partida para organizar quem chegou conversando`}>
              Sem {noun}<em className="num">{nf(none)}</em>
            </button>
          </span>
        )}
        {!items.length && <span className="muted" style={{ fontSize: 12.5 }}>Nenhum{kind === "tag" ? "a tag" : " departamento"} ainda.</span>}
      </div>
    </div>
  );
}
