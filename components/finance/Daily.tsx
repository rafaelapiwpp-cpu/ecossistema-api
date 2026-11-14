"use client";
import { useMemo, useState } from "react";
import { FRONTS, FRONT_COLOR, KIND_LABEL, costOf, fmtDM, profitOf, revenueOf, weekday, type DayRow } from "@/lib/finance";
import { fmtInt, fmtMoney } from "@/lib/format";
import { DailyChart } from "./FinCharts";
import type { FinProps } from "./Finance";

const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** Lucro do dia sem as entradas fixas (que caem todas no dia 1º). */
const variable = (d: DayRow) => Math.round((d.total - d.fixa) * 100) / 100;

/** Dia a dia: quanto entrou de lucro em cada dia, por frente, e os lançamentos do dia escolhido. */
export default function Daily({ s, openEntry }: FinProps) {
  const [pick, setPick] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const past = useMemo(() => s.days.filter((d) => !d.future || s.isPast), [s]);
  const fronts = FRONTS.filter((f) => f !== "fixa" && s.days.some((d) => d[f] !== 0));
  // o gráfico mostra o lucro variável de cada dia (as fixas esconderiam os outros dias)
  const chartDays = useMemo(() => s.days.map((d) => ({ ...d, fixa: 0 })), [s]);
  const day = pick && s.days.some((d) => d.day === pick) ? pick : s.isCurrent ? s.today : past[past.length - 1]?.day || s.start;
  const row = s.days.find((d) => d.day === day);
  const list = s.entries.filter((e) => (e.day < s.start ? s.start : e.day > s.close ? s.close : e.day) === day);
  const varTotal = past.reduce((a, d) => a + variable(d), 0);
  const withProfit = past.filter((d) => variable(d) !== 0);
  const rows = [...past].reverse().filter((d) => all || d.work || d.total !== 0);
  const week = s.weeks.find((w) => w.start <= s.today && s.today <= w.end);

  return (
    <>
      <div className="grid fin-three">
        <div className="card kpi"><div className="label">{s.isCurrent ? "Lucro de hoje" : "Lucro variável do mês"}</div><div className="value num">{fmtMoney(s.isCurrent ? s.todayProfit : varTotal)}</div>
          <div className="delta">{s.isCurrent ? (week ? <>Na semana ({fmtDM(week.start)} a {fmtDM(week.end)}): <b className="num">{fmtMoney(week.done)}</b></> : "Sem lançamentos na semana") : "Sem contar as entradas fixas"}</div></div>
        <div className="card kpi"><div className="label">Melhor dia</div><div className="value num">{s.bestDay ? fmtMoney(variable(s.bestDay)) : "—"}</div>
          <div className="delta">{s.bestDay ? <>{WD[weekday(s.bestDay.day)]}, {fmtDM(s.bestDay.day)}</> : "Ainda sem lançamentos"}</div></div>
        <div className="card kpi"><div className="label">Média por dia útil</div><div className="value num">{fmtMoney(s.workElapsed ? varTotal / s.workElapsed : 0)}</div>
          <div className="delta">{withProfit.length} dias com lucro em {s.workElapsed} dias úteis passados</div></div>
      </div>

      <div className="card section">
        <h2>Lucro de cada dia</h2>
        <p className="sub">Cada barra é o lucro do dia, por frente. As entradas fixas ficam de fora aqui. Clique num dia para ver os lançamentos dele.</p>
        {fronts.length ? <DailyChart days={chartDays} fronts={fronts} onPick={setPick} /> : <div className="empty">Nenhum lançamento neste mês</div>}
      </div>

      <div className="grid two section">
        <div className="card">
          <h2>Dia por dia</h2>
          <p className="sub">Do mais recente para o mais antigo. O acumulado inclui as entradas fixas.</p>
          <div className="table-wrap">
            <table className="fin-days">
              <thead><tr><th>Dia</th><th className="r">Lucro do dia</th><th className="r">Acumulado</th></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.day} className={`${d.day === day ? "fin-now" : ""} ${d.work ? "" : "fin-past"}`} onClick={() => setPick(d.day)}>
                    <td><b>{fmtDM(d.day)}</b> <span className="muted">{WD[weekday(d.day)]}{d.day === s.today ? " · hoje" : ""}</span></td>
                    <td className="r num">
                      <span className="fin-dots" aria-hidden>{FRONTS.filter((f) => d[f] !== 0).map((f) => <i key={f} style={{ background: FRONT_COLOR[f] }} title={KIND_LABEL[f]} />)}</span>
                      {d.total !== 0 ? <b>{fmtMoney(d.total)}</b> : <span className="muted">—</span>}
                    </td>
                    <td className="r num">{d.acc == null ? "—" : fmtMoney(d.acc)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={3} className="empty">O mês ainda não começou</td></tr>}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn quiet small" style={{ marginTop: 10 }} onClick={() => setAll((v) => !v)}>{all ? "Esconder fins de semana e folgas sem lançamento" : "Mostrar todos os dias"}</button>
        </div>

        <div className="card">
          <h2>{fmtDM(day)} · {WD[weekday(day)]}{day === s.today ? " · hoje" : ""}</h2>
          <p className="sub">Lucro do dia: <b className="num">{fmtMoney(row?.total || 0)}</b>{row && row.fixa > 0 ? <> (inclui {fmtMoney(row.fixa)} de entradas fixas)</> : null}</p>
          <div className="fin-list">
            {list.map((e) => (
              <button key={e.id} type="button" onClick={() => openEntry(e)}>
                <span><b><i className="fin-dot" style={{ background: FRONT_COLOR[e.kind] }} />{e.client || e.title || "Sem nome"}</b>
                  <small>{KIND_LABEL[e.kind]}{e.title && e.client ? ` · ${e.title}` : ""}{e.volume ? ` · ${fmtInt(e.volume)} disparos` : ""}</small>
                  <small>Cliente paga {fmtMoney(revenueOf(e))}{costOf(e) > 0 ? ` · custo ${fmtMoney(costOf(e))}` : ""}{e.paid ? "" : " · a receber"}</small></span>
                <span className="num">{fmtMoney(profitOf(e))}</span>
              </button>
            ))}
            {!list.length && <div className="muted" style={{ fontSize: 13 }}>Nada lançado neste dia.</div>}
          </div>
          <div className="row-actions" style={{ marginTop: 12 }}><button type="button" className="btn tint" onClick={() => openEntry({ day })}>Lançar neste dia</button></div>
        </div>
      </div>
    </>
  );
}
