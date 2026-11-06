"use client";
// Novo contato / editar contato: dados, departamento, tags, listas, campos personalizados e opt-out.
import { useState } from "react";
import { api, type Catalog, type Row } from "./shared";

export default function EditModal({ row, catalog, client = false, onClose, onSaved }: { row: Partial<Row>; catalog: Catalog; client?: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ waba_id: row.waba_id || catalog.wabas[0]?.id || "", phone: row.phone || "", name: row.name || "", email: row.email || "", department_id: row.department_id ? String(row.department_id) : "", notes: row.notes || "", opt_out: Boolean(row.opt_out), tag_ids: new Set((row.tags || []).map((t) => t.id)), list_ids: new Set((row.lists || []).map((l) => l.id)) });
  const [fields, setFields] = useState<[string, string][]>(Object.entries(row.fields || {}).map(([k, v]) => [k, String(v)]));
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    try {
      await api("/api/contatos", { action: "save", waba_id: f.waba_id, phone: f.phone, name: f.name || null, email: f.email || null, department_id: f.department_id || null, notes: f.notes || null, opt_out: f.opt_out, tag_ids: [...f.tag_ids], ...(client ? {} : { list_ids: [...f.list_ids] }), fields: Object.fromEntries(fields.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v])) });
      onSaved();
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><b>{row.id ? "Editar contato" : "Novo contato"}</b><button className="btn icon" onClick={onClose}>✕</button></div>
        {err && <div className="err">{err}</div>}
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label className="field"><span>Conta (WABA)</span><select value={f.waba_id} onChange={(e) => setF({ ...f, waba_id: e.target.value })} disabled={Boolean(row.id)}>{catalog.wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}</select></label>
          <label className="field"><span>Telefone (DDI+DDD+número)</span><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="5585999998888" disabled={Boolean(row.id)} /></label>
          <label className="field"><span>Nome</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field"><span>E-mail</span><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="field"><span>Departamento</span><select value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}><option value="">—</option>{catalog.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label className="check" style={{ alignSelf: "end" }}><input type="checkbox" checked={f.opt_out} onChange={(e) => setF({ ...f, opt_out: e.target.checked })} /> <span>Não receber mensagens (opt-out)</span></label>
        </div>
        <div className="field"><span>Tags</span><div className="tag-pick">{catalog.tags.map((t) => <label key={t.id} className={`chip pick ${f.tag_ids.has(t.id) ? "on" : ""}`}><input type="checkbox" hidden checked={f.tag_ids.has(t.id)} onChange={(e) => { const n = new Set(f.tag_ids); e.target.checked ? n.add(t.id) : n.delete(t.id); setF({ ...f, tag_ids: n }); }} />{t.name}</label>)}</div></div>
        {!client && <div className="field"><span>Listas</span><div className="tag-pick">{catalog.lists.filter((l) => !l.waba_id || l.waba_id === f.waba_id || f.list_ids.has(l.id)).map((l) => <label key={l.id} className={`chip pick ${f.list_ids.has(l.id) ? "on" : ""}`}><input type="checkbox" hidden checked={f.list_ids.has(l.id)} onChange={(e) => { const n = new Set(f.list_ids); e.target.checked ? n.add(l.id) : n.delete(l.id); setF({ ...f, list_ids: n }); }} />{l.name}</label>)}{!catalog.lists.length && <span className="muted" style={{ fontSize: 12 }}>Nenhuma lista ainda — crie na barra "Gerenciar selecionados" ou em Leads.</span>}</div></div>}
        <div className="field"><span>Campos personalizados</span>
          {fields.map(([k, v], i) => <div key={i} className="kv-row"><input placeholder="campo (ex.: cidade)" value={k} onChange={(e) => setFields(fields.map((x, j) => j === i ? [e.target.value, x[1]] : x))} /><input placeholder="valor" value={v} onChange={(e) => setFields(fields.map((x, j) => j === i ? [x[0], e.target.value] : x))} /></div>)}
          <button className="link" onClick={() => setFields([...fields, ["", ""]])}>+ campo</button>
        </div>
        <label className="field"><span>Observações</span><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Salvar</button></div>
      </div>
    </div>
  );
}
