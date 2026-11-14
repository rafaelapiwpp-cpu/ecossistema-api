"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Nav";
import { monthName, monthsOf, summarize, todaySP, type Config, type Entry, type Fixed, type Kind, type Summary } from "@/lib/finance";
import { fmtMoney } from "@/lib/format";
import Overview from "./Overview";
import Plan from "./Plan";
import Daily from "./Daily";
import Entries from "./Entries";
import Cash from "./Cash";
import EntryModal from "./EntryModal";
import FinSettings from "./FinSettings";

export type FinData = { entries: Entry[]; fixed: Fixed[]; config: Config };
/** Grava no servidor e atualiza a tela; devolve true quando deu certo. */
export type Run = (body: Record<string, unknown>, done?: string) => Promise<boolean>;
export type OpenEntry = (e?: Partial<Entry> | null, kind?: Kind) => void;
export type FinProps = { s: Summary; data: FinData; run: Run; openEntry: OpenEntry; goal: number; setGoal: (n: number) => void };

const TABS = [
  ["geral", "Visão geral"], ["dia", "Dia a dia"], ["plano", "Projeção e plano"], ["lanc", "Lançamentos"], ["caixa", "Caixa"], ["ajustes", "Ajustes"],
] as const;
type Tab = (typeof TABS)[number][0];

async function api(body?: Record<string, unknown>): Promise<FinData> {
  const r = await fetch("/api/financeiro", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export default function Finance() {
  const [data, setData] = useState<FinData | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [tab, setTab] = useState<Tab>("geral");
  const [month, setMonth] = useState("");
  const [goalPick, setGoalPick] = useState<number | null>(null);
  const [modal, setModal] = useState<{ entry: Partial<Entry> | null; kind?: Kind } | null>(null);
  const [today, setToday] = useState(() => todaySP());

  const load = useCallback(() => api().then((d) => { setData(d); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  // volta para a aba: confere o dia e recarrega (o lançamento pode ter sido feito em outro aparelho)
  useEffect(() => {
    const on = () => { if (document.visibilityState === "visible") { setToday(todaySP()); load(); } };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [load]);
  useEffect(() => { if (!ok) return; const t = window.setTimeout(() => setOk(""), 3500); return () => window.clearTimeout(t); }, [ok]);

  const run: Run = useCallback(async (body, done) => {
    setErr(""); setOk("");
    try { setData(await api(body)); setOk(done || "Salvo."); return true; } catch (e: any) { setErr(e.message || "Falha ao salvar"); return false; }
  }, []);
  const openEntry: OpenEntry = useCallback((e, kind) => setModal({ entry: e || null, kind }), []);

  const months = useMemo(() => (data ? monthsOf(data.entries, today, data.config) : null), [data, today]);
  const cur = month || months?.open || "";
  const s = useMemo(() => (data && cur ? summarize(data.entries, data.fixed, data.config, cur, today) : null), [data, cur, today]);

  if (!data || !s || !months) {
    return (
      <>
        <div className="topbar"><div className="title"><h1>Financeiro</h1><p>Lucro, metas e projeção da operação</p></div></div>
        {err ? <div className="banner err">{err} <button className="btn small" onClick={load}>Tentar de novo</button></div> : <div className="muted">Carregando…</div>}
      </>
    );
  }
  // meta em foco: a escolhida; sem escolha, a do mês (ou a próxima, se a do mês já foi batida)
  const goal = goalPick ?? (s.forecast >= data.config.monthGoal ? s.nextGoal : data.config.monthGoal);
  const props: FinProps = { s, data, run, openEntry, goal, setGoal: setGoalPick };
  const empty = !data.entries.length && !data.fixed.length;

  return (
    <div className="fin">
      <div className="topbar">
        <div className="title">
          <h1>Financeiro</h1>
          <p>{s.isPast ? "Mês fechado" : `Previsão de ${monthName(cur)}`}: <b className="num">{fmtMoney(s.forecast)}</b> · fecha em {s.close.slice(8, 10)}/{s.close.slice(5, 7)}</p>
        </div>
        <div className="controls">
          <label className="field fin-month"><select value={cur} onChange={(e) => { setMonth(e.target.value); setGoalPick(null); }} aria-label="Mês">
            {months.list.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select></label>
          <button className="btn primary" onClick={() => openEntry()}><Icon name="plus" size={16} className="" />Novo lançamento</button>
        </div>
      </div>
      {err && <div className="banner err">{err}</div>}
      {ok && <div className="fin-toast" role="status">{ok}</div>}
      <div className="fin-tabs" role="tablist">
        {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {empty && tab !== "ajustes" && tab !== "caixa" && (
        <div className="card fin-empty">
          <h2>Comece o seu financeiro</h2>
          <p className="sub">Ainda não há nada lançado. Registre a primeira campanha ou consultoria, ou traga tudo de uma vez por um arquivo em Ajustes.</p>
          <div className="row-actions"><button className="btn primary" onClick={() => openEntry()}>Novo lançamento</button><button className="btn" onClick={() => setTab("ajustes")}>Importar arquivo e cadastrar entradas fixas</button></div>
        </div>
      )}
      {tab === "geral" && <Overview {...props} goTo={(t) => setTab(t as Tab)} />}
      {tab === "dia" && <Daily {...props} />}
      {tab === "plano" && <Plan {...props} />}
      {tab === "lanc" && <Entries {...props} />}
      {tab === "caixa" && <Cash {...props} />}
      {tab === "ajustes" && <FinSettings {...props} month={cur} />}
      {modal && <EntryModal entry={modal.entry} kind={modal.kind} month={cur} today={today} config={data.config} clients={[...new Set(data.entries.map((e) => e.client).filter(Boolean))].sort()} run={run} onClose={() => setModal(null)} />}
    </div>
  );
}
