"use client";
// Importação da tabela de teleentrega: envia o arquivo (TXT, CSV, planilha ou PDF), mostra a prévia do que foi lido,
// a pessoa desmarca o que estiver errado, escolhe substituir ou adicionar e só então grava.
import { useRef, useState } from "react";
import { api } from "./Delivery";
import { fmtCep, money, zoneLabel, type ParsedZone } from "@/lib/delivery";

type Preview = { zones: ParsedZone[]; km_price: number | null; min_cost: number | null; ignored: number; kind: "pdf" | "sheet" | "text" };
const KIND: Record<string, string> = { pdf: "neste PDF", sheet: "nesta planilha", text: "neste arquivo" };

export default function DeliveryImport({ company, existing, onDone, onError }: { company: string; existing: number; onDone: (msg: string) => void; onError: (msg: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pv, setPv] = useState<Preview | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"replace" | "append">(existing ? "replace" : "append");
  const [useKm, setUseKm] = useState(true);
  const inp = useRef<HTMLInputElement>(null);

  const read = async (f: File | null) => {
    if (!f) return;
    setFile(f); setPv(null); setOff(new Set()); setBusy(true); onError("");
    try {
      const fd = new FormData(); fd.set("company", company); fd.set("file", f);
      const r = await fetch("/api/teleentrega", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      setPv(j);
    } catch (e: any) { onError(e.message); setFile(null); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!pv) return;
    const zones = pv.zones.filter((_, i) => !off.has(i));
    setBusy(true);
    try {
      const j = await api("/api/teleentrega", { company, action: "import_apply", mode, zones, km_price: useKm ? pv.km_price : null, min_cost: useKm ? pv.min_cost : null });
      onDone(`${j.saved} faixa${j.saved === 1 ? "" : "s"} ${mode === "replace" ? "importadas no lugar das anteriores" : "adicionadas"}.`);
    } catch (e: any) { onError(e.message); }
    finally { setBusy(false); }
  };
  const toggle = (i: number) => setOff((cur) => { const n = new Set(cur); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const kept = pv ? pv.zones.length - off.size : 0;

  return (
    <div className="dl-import">
      <div className="dl-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); read(e.dataTransfer.files?.[0] || null); }}>
        <input ref={inp} type="file" accept=".txt,.csv,.tsv,.xlsx,.xlsm,.xls,.ods,.pdf" hidden onChange={(e) => read(e.target.files?.[0] || null)} />
        <div>
          <b>{file ? file.name : "Escolha o arquivo com as faixas"}</b>
          <small>TXT, CSV, planilha (XLSX) ou PDF com texto. Uma faixa por linha: bairro, CEP inicial, CEP final e valor — ex.: <code>Centro; 90000-000; 90099-999; R$ 5,00</code>. Linhas como "R$ 2,50 por km" e "mínimo R$ 6,00" também são lidas.</small>
        </div>
        <button type="button" className="btn primary" onClick={() => inp.current?.click()} disabled={busy}>{busy && !pv ? "Lendo…" : file ? "Trocar arquivo" : "Escolher arquivo"}</button>
      </div>

      {pv && (
        <div className="dl-preview-box">
          <p className="dl-found">
            Encontrei <b>{pv.zones.length} faixa{pv.zones.length === 1 ? "" : "s"}</b> {KIND[pv.kind] || "neste arquivo"}{pv.ignored ? ` (${pv.ignored} linha${pv.ignored === 1 ? "" : "s"} sem faixa ignorada${pv.ignored === 1 ? "" : "s"})` : ""}. Confira e desmarque o que estiver errado.
          </p>
          {pv.zones.length > 0 && (
            <div className="dl-table dl-pv">
              <table>
                <thead><tr><th /><th>Faixa</th><th>CEP inicial</th><th>CEP final</th><th className="r">Valor</th></tr></thead>
                <tbody>
                  {pv.zones.map((z, i) => (
                    <tr key={i} className={off.has(i) ? "off" : ""} onClick={() => toggle(i)}>
                      <td><input type="checkbox" checked={!off.has(i)} onChange={() => toggle(i)} aria-label="Importar esta faixa" /></td>
                      <td><b>{z.name || <span className="muted">{zoneLabel(z)}</span>}</b></td>
                      <td>{z.cep_start ? fmtCep(z.cep_start) : <span className="muted">—</span>}</td>
                      <td>{z.cep_end ? fmtCep(z.cep_end) : <span className="muted">—</span>}</td>
                      <td className="r"><b>{money(z.cost)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(pv.km_price != null || pv.min_cost != null) && (
            <label className="dl-opt"><input type="checkbox" checked={useKm} onChange={(e) => setUseKm(e.target.checked)} /><span>Também encontrei {pv.km_price != null ? <b>{money(pv.km_price)} por km</b> : null}{pv.km_price != null && pv.min_cost != null ? " e " : ""}{pv.min_cost != null ? <b>mínimo de {money(pv.min_cost)}</b> : null} — salvar no custo por km.</span></label>
          )}
          {existing > 0 && pv.zones.length > 0 && (
            <div className="dl-mode">
              <label className="dl-opt"><input type="radio" name="dl-mode" checked={mode === "replace"} onChange={() => setMode("replace")} /><span><b>Substituir</b> as {existing} faixas atuais por estas</span></label>
              <label className="dl-opt"><input type="radio" name="dl-mode" checked={mode === "append"} onChange={() => setMode("append")} /><span><b>Adicionar</b> às faixas atuais</span></label>
            </div>
          )}
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn primary" onClick={apply} disabled={busy || (!kept && !(useKm && (pv.km_price != null || pv.min_cost != null)))}>{busy ? "Salvando…" : kept ? `Salvar ${kept} faixa${kept === 1 ? "" : "s"}` : "Salvar"}</button>
            <button type="button" className="btn" onClick={() => { setPv(null); setFile(null); }} disabled={busy}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
