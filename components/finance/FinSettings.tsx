"use client";
import { useEffect, useRef, useState } from "react";
import { fixedIn, fmtDM, monthName, type Config, type Fixed } from "@/lib/finance";
import { fmtMoney } from "@/lib/format";
import type { FinProps } from "./Finance";

const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dec = (v: string) => { const t = String(v).trim(); const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return isFinite(n) && n > 0 ? n : 0; };
const str = (n: number, d = 2) => String(Number(n.toFixed(d))).replace(".", ",");
const formOf = (c: Config) => ({ firstGoal: str(c.firstGoal), step: str(c.step), monthGoal: str(c.monthGoal), closingDay: String(c.closingDay), price: str(c.price, 4), unitCost: str(c.unitCost, 4) });

/** Ajustes: metas, preço padrão, dias de trabalho, entradas fixas e cópia/importação dos dados. */
export default function FinSettings({ data, run, month }: FinProps & { month: string }) {
  const cfg = data.config;
  const [f, setF] = useState(() => formOf(cfg));
  const [workdays, setWorkdays] = useState<number[]>(cfg.workdays);
  const [holidays, setHolidays] = useState<string[]>(cfg.holidays);
  const [newHoliday, setNewHoliday] = useState("");
  const [fx, setFx] = useState<{ id: number; client: string; amount: string; start_month: string; end_month: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { setF(formOf(cfg)); setWorkdays(cfg.workdays); setHolidays(cfg.holidays); }, [cfg]);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const saveConfig = async () => {
    setBusy(true);
    await run({ action: "config_save", config: { firstGoal: dec(f.firstGoal), step: dec(f.step), monthGoal: dec(f.monthGoal), closingDay: Number(f.closingDay.replace(/\D/g, "")) || 0, price: dec(f.price), unitCost: dec(f.unitCost), workdays, holidays } }, "Ajustes salvos.");
    setBusy(false);
  };
  const saveFixed = async () => {
    if (!fx) return;
    setBusy(true);
    const good = await run({ action: "fixed_save", id: fx.id, client: fx.client, amount: dec(fx.amount), start_month: fx.start_month, end_month: fx.end_month || null, active: true }, "Entrada fixa salva.");
    setBusy(false);
    if (good) setFx(null);
  };
  const editFixed = (x?: Fixed) => setFx(x ? { id: x.id, client: x.client, amount: str(x.amount), start_month: x.start_month, end_month: x.end_month || "" } : { id: 0, client: "", amount: "", start_month: month, end_month: "" });

  const exportAll = () => {
    const blob = new Blob([JSON.stringify({ entries: data.entries, fixed: data.fixed, config: data.config }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `financeiro-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importFile = async (fl: File | undefined) => {
    setMsg("");
    if (!fl) return;
    try {
      const j = JSON.parse(await fl.text());
      const n = (Array.isArray(j.entries) ? j.entries.length : 0), m = (Array.isArray(j.fixed) ? j.fixed.length : 0);
      if (!n && !m) { setMsg("Esse arquivo não tem lançamentos."); return; }
      const has = data.entries.length + data.fixed.length > 0;
      const replace = has ? confirm(`O arquivo tem ${n} lançamentos e ${m} entradas fixas.\n\nOK = substituir tudo o que existe hoje pelo arquivo.\nCancelar = somar o arquivo ao que já existe.`) : true;
      setBusy(true);
      await run({ action: "import", entries: j.entries || [], fixed: j.fixed || [], config: j.config, replace }, `Importado: ${n} lançamentos e ${m} entradas fixas.`);
      setBusy(false);
    } catch { setMsg("Não consegui ler esse arquivo. Use o arquivo .json do financeiro."); }
    if (file.current) file.current.value = "";
  };

  return (
    <>
      <div className="grid two">
        <div className="card">
          <h2>Metas e fechamento</h2>
          <p className="sub">A primeira meta, de quanto em quanto sobem as próximas e a meta do mês. O mês conta até o dia de fechamento do mês seguinte.</p>
          <div className="fin-form">
            <label className="field"><span>Primeira meta (R$)</span><input inputMode="decimal" value={f.firstGoal} onChange={(e) => set({ firstGoal: e.target.value })} /></label>
            <label className="field"><span>Sobe de quanto em quanto (R$)</span><input inputMode="decimal" value={f.step} onChange={(e) => set({ step: e.target.value })} /></label>
            <label className="field"><span>Meta do mês (R$)</span><input inputMode="decimal" value={f.monthGoal} onChange={(e) => set({ monthGoal: e.target.value })} /></label>
            <label className="field"><span>Fecha no dia (do mês seguinte; 0 = último dia)</span><input inputMode="numeric" value={f.closingDay} onChange={(e) => set({ closingDay: e.target.value })} /></label>
            <label className="field"><span>Preço padrão por disparo (R$)</span><input inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value })} /></label>
            <label className="field"><span>Custo padrão por entregue (R$)</span><input inputMode="decimal" value={f.unitCost} onChange={(e) => set({ unitCost: e.target.value })} /></label>
          </div>
          <h2 style={{ marginTop: 18 }}>Dias de trabalho</h2>
          <p className="sub">O plano reparte o que falta só pelos dias marcados, tirando feriados e folgas.</p>
          <div className="fin-switch" role="group" aria-label="Dias da semana">
            {WD.map((label, i) => <button key={i} type="button" aria-pressed={workdays.includes(i)} className={workdays.includes(i) ? "on" : ""} onClick={() => setWorkdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort()))}>{label}</button>)}
          </div>
          <div className="fin-inline" style={{ marginTop: 12 }}>
            <input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} aria-label="Feriado ou folga" />
            <button type="button" className="btn small" disabled={!newHoliday} onClick={() => { setHolidays((h) => [...new Set([...h, newHoliday])].sort()); setNewHoliday(""); }}>Adicionar feriado ou folga</button>
          </div>
          <div className="fin-goals" style={{ marginTop: 10 }}>
            {holidays.map((h) => <button key={h} type="button" title="Tirar da lista" onClick={() => setHolidays((x) => x.filter((d) => d !== h))}>{fmtDM(h)}/{h.slice(2, 4)} ✕</button>)}
            {!holidays.length && <span className="muted" style={{ fontSize: 12.5 }}>Nenhum feriado ou folga cadastrado.</span>}
          </div>
          <div className="row-actions" style={{ marginTop: 16 }}><button className="btn primary" disabled={busy || !workdays.length} onClick={saveConfig}>{busy ? "Salvando…" : "Salvar ajustes"}</button></div>
        </div>

        <div className="card">
          <h2>Entradas fixas</h2>
          <p className="sub">Clientes de valor fixo todo mês. Entram sozinhas em cada mês, a partir do mês de início.</p>
          <div className="fin-list">
            {data.fixed.map((x) => (
              <button key={x.id} type="button" onClick={() => editFixed(x)}>
                <span><b>{x.client}</b><small>desde {monthName(x.start_month)}{x.end_month ? ` até ${monthName(x.end_month)}` : ""}{fixedIn(x, month) ? "" : " · fora do mês selecionado"}</small></span>
                <span className="num">{fmtMoney(x.amount)}</span>
              </button>
            ))}
            {!data.fixed.length && <div className="muted" style={{ fontSize: 13 }}>Nenhuma entrada fixa cadastrada.</div>}
          </div>
          {fx ? (
            <div className="fin-form" style={{ marginTop: 14 }}>
              <label className="field"><span>Cliente</span><input value={fx.client} onChange={(e) => setFx({ ...fx, client: e.target.value })} /></label>
              <label className="field"><span>Valor mensal (R$)</span><input inputMode="decimal" value={fx.amount} onChange={(e) => setFx({ ...fx, amount: e.target.value })} /></label>
              <label className="field"><span>Começa em</span><input type="month" value={fx.start_month} onChange={(e) => setFx({ ...fx, start_month: e.target.value })} /></label>
              <label className="field"><span>Termina em (opcional)</span><input type="month" value={fx.end_month} onChange={(e) => setFx({ ...fx, end_month: e.target.value })} /></label>
              <div className="fin-modal-foot wide">
                {fx.id ? <button className="btn danger" disabled={busy} onClick={async () => { if (confirm("Excluir esta entrada fixa de todos os meses? Para encerrar sem apagar o passado, preencha \"Termina em\".")) { setBusy(true); await run({ action: "fixed_delete", id: fx.id }, "Entrada fixa excluída."); setBusy(false); setFx(null); } }}>Excluir</button> : <span />}
                <div className="row-actions"><button className="btn" onClick={() => setFx(null)}>Cancelar</button><button className="btn primary" disabled={busy || !fx.client.trim() || !dec(fx.amount) || !fx.start_month} onClick={saveFixed}>Salvar</button></div>
              </div>
            </div>
          ) : <div className="row-actions" style={{ marginTop: 12 }}><button className="btn tint" onClick={() => editFixed()}>Nova entrada fixa</button></div>}

          <h2 style={{ marginTop: 22 }}>Cópia e importação</h2>
          <p className="sub">Baixe uma cópia de tudo ou traga lançamentos de um arquivo .json do financeiro.</p>
          <div className="row-actions">
            <button className="btn" onClick={exportAll} disabled={!data.entries.length && !data.fixed.length}>Baixar cópia</button>
            <button className="btn" onClick={() => file.current?.click()} disabled={busy}>Importar arquivo</button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          </div>
          {msg && <p className="err" style={{ margin: "10px 0 0" }}>{msg}</p>}
        </div>
      </div>
    </>
  );
}
