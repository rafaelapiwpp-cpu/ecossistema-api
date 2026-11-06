"use client";
// Teleentrega (portal): consulta rápida, custo por km + texto do atalho, e a tabela de faixas de CEP (manual ou importada).
import { useEffect, useState } from "react";
import { Icon } from "./Nav";
import DeliveryImport from "./DeliveryImport";
import { DEFAULT_MESSAGE, fmtCep, lookup, money, renderMessage, zoneLabel, type DeliverySettings, type Zone } from "@/lib/delivery";

type Data = { company: { id: number; name: string; slug: string }; zones: Zone[]; settings: DeliverySettings; canEdit: boolean; defaultMessage: string };
type ZoneForm = { name: string; cep_start: string; cep_end: string; cost: string };
const EMPTY: ZoneForm = { name: "", cep_start: "", cep_end: "", cost: "" };
const num = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

export async function api(url: string, body?: any) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export default function Delivery({ company }: { company: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [importing, setImporting] = useState(false);
  const load = () => api(`/api/teleentrega?company=${encodeURIComponent(company)}`).then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [company]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (body: any, done = "Salvo.") => {
    setErr(""); setOk("");
    try { const j = await api("/api/teleentrega", { company, ...body }); setOk(done); await load(); return j; } catch (e: any) { setErr(e.message); throw e; }
  };
  if (!d) return <div className="muted">{err || "Carregando…"}</div>;
  return (
    <>
      {err && <div className="banner err"><span>{err}</span></div>}
      {ok && <div className="banner"><span className="ok">{ok}</span></div>}
      <div className="dl-top">
        <ConsultCard d={d} />
        <KmCard d={d} run={run} />
      </div>
      <div className="card dl-zones">
        <div className="cp-head">
          <div><h2>Faixas de CEP</h2><p className="sub">Uma faixa por bairro ou região: CEP inicial, CEP final e valor. A consulta do atendimento usa esta tabela.</p></div>
          {d.canEdit && (
            <div className="row-actions">
              <button className={`btn ${importing ? "" : "tint"}`} onClick={() => setImporting((v) => !v)}><Icon name="up" size={15} className="" />{importing ? "Fechar importação" : "Importar arquivo"}</button>
              {d.zones.length > 0 && <button className="btn danger" onClick={() => { if (confirm(`Apagar todas as ${d.zones.length} faixas?`)) run({ action: "zones_clear" }, "Faixas apagadas."); }}>Limpar tudo</button>}
            </div>
          )}
        </div>
        {importing && d.canEdit && <DeliveryImport company={company} existing={d.zones.length} onDone={(msg) => { setImporting(false); setOk(msg); load(); }} onError={setErr} />}
        <ZonesTable d={d} run={run} />
      </div>
    </>
  );
}

function ConsultCard({ d }: { d: Data }) {
  const [q, setQ] = useState("");
  const r = lookup(d.zones, d.settings, q);
  let out: React.ReactNode = null;
  if (r?.kind === "cep") out = r.zone ? <Result title={zoneLabel(r.zone)} sub={`CEP ${fmtCep(r.cep)} · ${fmtCep(r.zone.cep_start)} a ${fmtCep(r.zone.cep_end)}`} value={money(r.zone.cost)} /> : <p className="dl-none">Nenhuma faixa cobre o CEP {fmtCep(r.cep)}.</p>;
  else if (r?.kind === "km") out = r.cost != null ? <Result title={`${num(r.km)} km`} sub={`${money(d.settings.km_price)} por km${d.settings.min_cost ? ` · mínimo ${money(d.settings.min_cost)}` : ""}`} value={money(r.cost)} /> : <p className="dl-none">Cadastre o valor por km ao lado para consultar por distância.</p>;
  else if (r?.kind === "name") out = r.zones.length ? r.zones.map((z) => <Result key={z.id} title={zoneLabel(z)} sub={z.cep_start ? `${fmtCep(z.cep_start)} a ${fmtCep(z.cep_end)}` : "Faixa pelo nome"} value={money(z.cost)} />) : <p className="dl-none">Nenhum bairro com "{r.q}".</p>;
  return (
    <div className="card">
      <h2>Consultar</h2>
      <p className="sub">Digite o CEP do cliente, o bairro ou a distância (ex.: 3 km). É a mesma consulta do atalho no Atendimento.</p>
      <label className="field"><span className="sr-only">CEP, bairro ou km</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="90000-000, Centro ou 3 km" inputMode="text" /></label>
      <div className="dl-results">{out}{!d.zones.length && !d.settings.km_price && <p className="dl-none">Nenhuma faixa cadastrada ainda. {d.canEdit ? "Importe um arquivo ou adicione as faixas abaixo." : "Peça ao responsável para cadastrar."}</p>}</div>
    </div>
  );
}

const Result = ({ title, sub, value }: { title: string; sub: string; value: string }) => (
  <div className="dl-result"><div><b>{title}</b><small>{sub}</small></div><strong>{value}</strong></div>
);

function KmCard({ d, run }: { d: Data; run: (b: any, done?: string) => Promise<any> }) {
  const s = d.settings;
  const [f, setF] = useState({ km_price: num(s.km_price), min_cost: num(s.min_cost), message: s.message || "", note: s.note || "" });
  useEffect(() => setF({ km_price: num(s.km_price), min_cost: num(s.min_cost), message: s.message || "", note: s.note || "" }), [s.km_price, s.min_cost, s.message, s.note]);
  const preview = renderMessage(f.message || DEFAULT_MESSAGE, { local: "Centro", valor: money(7.5), cep: "90000-000", km: "3" });
  if (!d.canEdit) {
    return (
      <div className="card"><h2>Custo por quilômetro</h2>
        {s.km_price ? <p className="sub">{money(s.km_price)} por km{s.min_cost ? `, mínimo ${money(s.min_cost)}` : ""}.</p> : <p className="sub">Sem valor por km cadastrado.</p>}
        {s.note && <p className="dl-note">{s.note}</p>}
      </div>
    );
  }
  return (
    <div className="card">
      <h2>Custo por quilômetro e texto do atalho</h2>
      <p className="sub">Para entregas fora das faixas: valor por km e o mínimo cobrado. O texto é o que o atalho insere na mensagem — use {"{local}"}, {"{valor}"}, {"{cep}"} e {"{km}"}.</p>
      <div className="grid two" style={{ gap: 10 }}>
        <label className="field"><span>Valor por km (R$)</span><input value={f.km_price} onChange={(e) => setF({ ...f, km_price: e.target.value })} placeholder="2,50" inputMode="decimal" /></label>
        <label className="field"><span>Valor mínimo (R$)</span><input value={f.min_cost} onChange={(e) => setF({ ...f, min_cost: e.target.value })} placeholder="6,00" inputMode="decimal" /></label>
      </div>
      <label className="field" style={{ marginTop: 10 }}><span>Texto do atalho</span><input value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder={DEFAULT_MESSAGE} maxLength={300} /></label>
      <p className="dl-preview">Exemplo: {preview}</p>
      <label className="field"><span>Observação para a equipe (opcional)</span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ex.: entregas até as 20h; acima de 10 km combinar" maxLength={300} /></label>
      <div className="row-actions" style={{ marginTop: 12 }}><button className="btn primary" onClick={() => run({ action: "settings_save", ...f }, "Custo por km salvo.")}>Salvar</button></div>
    </div>
  );
}

function ZonesTable({ d, run }: { d: Data; run: (b: any, done?: string) => Promise<any> }) {
  const [form, setForm] = useState<ZoneForm>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [edit, setEdit] = useState<ZoneForm>(EMPTY);
  const [filter, setFilter] = useState("");
  const save = async () => { await run({ action: "zone_save", ...form }, "Faixa adicionada."); setForm(EMPTY); };
  const startEdit = (z: Zone) => { setEditing(z.id); setEdit({ name: z.name, cep_start: fmtCep(z.cep_start), cep_end: fmtCep(z.cep_end), cost: num(z.cost) }); };
  const saveEdit = async () => { await run({ action: "zone_save", id: editing, ...edit }, "Faixa atualizada."); setEditing(null); };
  const f = filter.trim().toLowerCase();
  const list = f ? d.zones.filter((z) => z.name.toLowerCase().includes(f) || (z.cep_start || "").includes(f.replace(/\D/g, "") || "§")) : d.zones;
  return (
    <>
      {d.zones.length > 8 && <label className="field dl-filter"><span className="sr-only">Filtrar faixas</span><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar por bairro ou CEP" /></label>}
      <div className="dl-table">
        <table>
          <thead><tr><th>Faixa</th><th>CEP inicial</th><th>CEP final</th><th className="r">Valor</th>{d.canEdit && <th />}</tr></thead>
          <tbody>
            {d.canEdit && (
              <tr className="dl-new"><ZoneInputs v={form} set={setForm} onEnter={save} /><td className="r"><button className="btn primary small" onClick={save} disabled={!form.cost.trim() || (!form.name.trim() && !form.cep_start.trim())}>Adicionar</button></td></tr>
            )}
            {list.map((z) => editing === z.id ? (
              <tr key={z.id} className="dl-new"><ZoneInputs v={edit} set={setEdit} onEnter={saveEdit} /><td className="r"><div className="row-actions" style={{ justifyContent: "flex-end" }}><button className="btn primary small" onClick={saveEdit}>Salvar</button><button className="btn small" onClick={() => setEditing(null)}>Cancelar</button></div></td></tr>
            ) : (
              <tr key={z.id}>
                <td><b>{z.name || <span className="muted">Sem nome</span>}</b></td>
                <td>{z.cep_start ? fmtCep(z.cep_start) : <span className="muted">—</span>}</td>
                <td>{z.cep_end ? fmtCep(z.cep_end) : <span className="muted">—</span>}</td>
                <td className="r"><b>{money(z.cost)}</b></td>
                {d.canEdit && <td className="r"><div className="row-actions" style={{ justifyContent: "flex-end" }}><button className="btn small" onClick={() => startEdit(z)}>Editar</button><button className="btn small quiet danger" onClick={() => { if (confirm(`Apagar a faixa "${zoneLabel(z)}"?`)) run({ action: "zone_delete", id: z.id }, "Faixa apagada."); }}>Apagar</button></div></td>}
              </tr>
            ))}
            {!d.zones.length && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 18 }}>Nenhuma faixa ainda.{d.canEdit ? " Adicione acima ou importe um arquivo (TXT, CSV, planilha ou PDF)." : ""}</td></tr>}
          </tbody>
        </table>
      </div>
      {d.zones.length > 0 && <p className="dl-count">{d.zones.length} faixa{d.zones.length > 1 ? "s" : ""}{f && list.length !== d.zones.length ? ` · ${list.length} no filtro` : ""}</p>}
    </>
  );
}

// fora do componente da tabela: se fosse criado a cada render, os campos perderiam o foco a cada tecla
function ZoneInputs({ v, set, onEnter }: { v: ZoneForm; set: (v: ZoneForm) => void; onEnter: () => void }) {
  const key = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } };
  return (
    <>
      <td><input value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} onKeyDown={key} placeholder="Bairro ou região" aria-label="Nome da faixa" /></td>
      <td><input value={v.cep_start} onChange={(e) => set({ ...v, cep_start: e.target.value })} onKeyDown={key} placeholder="90000-000" inputMode="numeric" aria-label="CEP inicial" /></td>
      <td><input value={v.cep_end} onChange={(e) => set({ ...v, cep_end: e.target.value })} onKeyDown={key} placeholder="90099-999" inputMode="numeric" aria-label="CEP final" /></td>
      <td className="r"><input value={v.cost} onChange={(e) => set({ ...v, cost: e.target.value })} onKeyDown={key} placeholder="7,50" inputMode="decimal" aria-label="Valor" /></td>
    </>
  );
}
