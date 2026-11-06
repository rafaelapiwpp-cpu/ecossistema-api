"use client";
// Importar planilha (CSV) de contatos: escolhe as colunas, a conta, e já aplica tag, lista e departamento.
import { useState } from "react";
import { api, type Catalog } from "./shared";

/** Lê CSV simples (; ou , ou tab), com cabeçalho. */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const sep = [";", ",", "\t"].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const split = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]);
  return { headers, rows: lines.slice(1).map(split) };
}

export function ImportModal({ catalog, onClose, onDone, client = false, company }: { catalog: Catalog; onClose: () => void; onDone: (msg: string) => void; client?: boolean; company?: string }) {
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [map, setMap] = useState<{ phone: string; name: string; email: string }>({ phone: "", name: "", email: "" });
  const [opts, setOpts] = useState({ waba_id: catalog.wabas[0]?.id || "", tag_id: "", list_id: "", department_id: "", new_list: "", new_tag: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const guess = (hs: string[], words: string[]) => hs.find((h) => words.some((w) => h.toLowerCase().includes(w))) || "";
  const onFile = async (file: File) => {
    const text = await file.text();
    const p = parseCsv(text);
    setParsed(p);
    setMap({ phone: guess(p.headers, ["tel", "phone", "whats", "celular", "fone", "número", "numero"]), name: guess(p.headers, ["nome", "name", "cliente"]), email: guess(p.headers, ["mail"]) });
  };
  const run = async () => {
    if (!parsed || !map.phone) { setErr("Escolha a coluna do telefone"); return; }
    setBusy(true); setErr("");
    try {
      let tagIds: number[] = opts.tag_id ? [Number(opts.tag_id)] : [];
      let listId = opts.list_id ? Number(opts.list_id) : null;
      if (opts.new_tag.trim()) { await api(client ? "/api/portal" : "/api/equipe", { action: "tag_save", name: opts.new_tag.trim(), company }); const c = await api("/api/catalogo"); const t = c.tags.find((x: any) => x.name === opts.new_tag.trim()); if (t) tagIds.push(t.id); }
      if (!client && opts.new_list.trim()) { await api("/api/equipe", { action: "list_save", name: opts.new_list.trim(), waba_id: opts.waba_id }); const c = await api("/api/catalogo"); const l = c.lists.find((x: any) => x.name === opts.new_list.trim()); if (l) listId = l.id; }
      const hi = (h: string) => parsed.headers.indexOf(h);
      const extraCols = parsed.headers.filter((h) => ![map.phone, map.name, map.email].includes(h));
      const rows = parsed.rows.map((r) => ({ phone: r[hi(map.phone)], name: map.name ? r[hi(map.name)] : "", email: map.email ? r[hi(map.email)] : "", fields: Object.fromEntries(extraCols.map((h) => [h, r[hi(h)]])) }));
      let imported = 0, invalid = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const j = await api("/api/contatos/importar", { waba_id: opts.waba_id, rows: rows.slice(i, i + 500), tag_ids: tagIds, list_id: listId, department_id: opts.department_id || null });
        imported += j.imported; invalid += j.invalid;
      }
      onDone(`Importação concluída: ${imported} contato(s) gravado(s), ${invalid} linha(s) ignorada(s) (telefone inválido ou repetido).`);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><b>Importar planilha (CSV)</b><button className="btn icon" onClick={onClose}>✕</button></div>
        <p className="muted" style={{ margin: 0 }}>Salve a planilha como CSV (no Excel/Google Sheets: Arquivo → Baixar → CSV). A primeira linha deve ter os nomes das colunas. Telefones sem DDI recebem 55.</p>
        {err && <div className="err">{err}</div>}
        <input type="file" accept=".csv,text/csv,.txt" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {parsed && (
          <>
            <div className="muted">{parsed.rows.length} linha(s) encontradas. Colunas: {parsed.headers.join(", ")}</div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <label className="field"><span>Coluna do telefone *</span><select value={map.phone} onChange={(e) => setMap({ ...map, phone: e.target.value })}><option value="">—</option>{parsed.headers.map((h) => <option key={h}>{h}</option>)}</select></label>
              <label className="field"><span>Coluna do nome</span><select value={map.name} onChange={(e) => setMap({ ...map, name: e.target.value })}><option value="">—</option>{parsed.headers.map((h) => <option key={h}>{h}</option>)}</select></label>
              <label className="field"><span>Coluna do e-mail</span><select value={map.email} onChange={(e) => setMap({ ...map, email: e.target.value })}><option value="">—</option>{parsed.headers.map((h) => <option key={h}>{h}</option>)}</select></label>
            </div>
            <div className="muted">{client ? "As demais colunas viram campos personalizados do contato (ficam no painel do contato, no atendimento)." : "As demais colunas viram campos personalizados do contato (úteis como variáveis nos disparos)."}</div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label className="field"><span>Conta (WABA)</span><select value={opts.waba_id} onChange={(e) => setOpts({ ...opts, waba_id: e.target.value })}>{catalog.wabas.map((w) => <option key={w.id} value={w.id}>{w.name || w.id}</option>)}</select></label>
              <label className="field"><span>Departamento</span><select value={opts.department_id} onChange={(e) => setOpts({ ...opts, department_id: e.target.value })}><option value="">—</option>{catalog.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
              {!client && <label className="field"><span>Adicionar à lista</span><select value={opts.list_id} onChange={(e) => setOpts({ ...opts, list_id: e.target.value })}><option value="">—</option>{catalog.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
              {!client && <label className="field"><span>…ou criar lista nova</span><input value={opts.new_list} onChange={(e) => setOpts({ ...opts, new_list: e.target.value })} placeholder="ex.: Black Friday 2026" /></label>}
              <label className="field"><span>Aplicar tag</span><select value={opts.tag_id} onChange={(e) => setOpts({ ...opts, tag_id: e.target.value })}><option value="">—</option>{catalog.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label className="field"><span>…ou criar tag nova</span><input value={opts.new_tag} onChange={(e) => setOpts({ ...opts, new_tag: e.target.value })} placeholder="ex.: lead-site" /></label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={run} disabled={busy}>{busy ? "Importando…" : `Importar ${parsed.rows.length} linha(s)`}</button></div>
          </>
        )}
      </div>
    </div>
  );
}
