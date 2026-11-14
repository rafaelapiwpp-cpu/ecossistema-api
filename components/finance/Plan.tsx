"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtDM, planFor } from "@/lib/finance";
import { fmtInt, fmtMoney, fmtMoney4, fmtPct } from "@/lib/format";
import { TrackChart } from "./FinCharts";
import { trackPoints } from "./Overview";
import type { FinProps } from "./Finance";

const mil = (n: number) => `R$ ${String(Math.round(n / 100) / 10).replace(".", ",")} mil`;
const dec = (v: string) => { const t = v.trim(); const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return isFinite(n) && n >= 0 ? n : 0; };
const show = (n: number, d = 2) => String(Number(n.toFixed(d))).replace(".", ",");

/** Projeção e plano: quanto falta para a meta, repartido por semana e por dia útil, e um simulador. */
export default function Plan({ s, data, goal, setGoal }: FinProps) {
  const cfg = data.config;
  // premissas do plano (começam na média real do mês; mexer aqui não altera nada lançado)
  const [price, setPrice] = useState(show(s.shots.price, 4));
  const [cost, setCost] = useState(show(cfg.unitCost, 4));
  const [delivery, setDelivery] = useState(show(s.shots.delivery * 100, 1));
  const [perDayShots, setPerDayShots] = useState("");
  const [extra, setExtra] = useState("");
  const [custom, setCustom] = useState("");
  useEffect(() => { setPrice(show(s.shots.price, 4)); setDelivery(show(s.shots.delivery * 100, 1)); setPerDayShots(""); setExtra(""); }, [s.month]); // eslint-disable-line react-hooks/exhaustive-deps

  const perShot = Math.max(0, dec(price) - dec(cost) * Math.min(1, dec(delivery) / 100));
  const plan = useMemo(() => planFor(s, goal, perShot), [s, goal, perShot]);
  const points = useMemo(() => trackPoints(s, plan.perDay), [s, plan.perDay]);
  const simShots = Number(perDayShots.replace(/\D/g, "")) || 0;
  const simEnd = s.forecast + simShots * perShot * s.workLeft + dec(extra);
  const simGap = goal - simEnd;
  const goalValues = s.goals.map((g) => g.value);
  const open = !s.isPast;

  return (
    <>
      <div className="card">
        <h2>Qual meta você quer bater?</h2>
        <p className="sub">Escolha a meta e o plano abaixo se ajusta. Hoje a previsão está em <b className="num">{fmtMoney(s.forecast)}</b>.</p>
        <div className="fin-goals big">
          {s.goals.map((g) => <button key={g.value} type="button" className={`${g.hit ? "hit" : ""} ${g.value === goal ? "on" : ""}`} onClick={() => setGoal(g.value)}>{g.hit ? "✓ " : ""}{mil(g.value)}</button>)}
          {!goalValues.includes(goal) && <button type="button" className="on">{mil(goal)}</button>}
          <span className="fin-inline"><input inputMode="decimal" placeholder="Outra meta (R$)" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && dec(custom) > 0) { setGoal(dec(custom)); setCustom(""); } }} aria-label="Outra meta em reais" />
            <button type="button" className="btn small" disabled={!(dec(custom) > 0)} onClick={() => { setGoal(dec(custom)); setCustom(""); }}>Usar</button></span>
        </div>
      </div>

      <div className="grid fin-three section">
        <div className="card kpi"><div className="label">Se não fizer mais nada</div><div className="value num">{fmtMoney(s.forecast)}</div><div className="delta">{plan.missing > 0 ? <>Faltariam {fmtMoney(plan.missing)} para a meta</> : "Meta já batida"}</div></div>
        <div className="card kpi"><div className="label">Continuando no ritmo atual</div><div className="value num">{open ? fmtMoney(s.atPace) : "—"}</div>
          <div className="delta">{open ? <>{fmtMoney(s.pace)}/dia útil em disparos × {s.workLeft} dias · {plan.reachable ? <span className="ok">chega na meta</span> : <span className="err">não chega: faltam {fmtMoney(goal - s.atPace)}</span>}</> : "Mês fechado"}</div></div>
        <div className={`card kpi ${plan.missing > 0 ? "fin-kpi-hl" : ""}`}><div className="label">Para bater {mil(goal)}</div>
          <div className="value num">{plan.missing > 0 ? (open ? `${fmtMoney(plan.perDay)}/dia útil` : fmtMoney(plan.missing)) : "Batida 🎉"}</div>
          <div className="delta">{plan.missing > 0 ? (open ? <>≈ <b>{fmtInt(plan.shotsPerDay)} disparos por dia</b> · {fmtInt(plan.shotsTotal)} no total em {s.workLeft} dias úteis</> : "Ficou faltando no fechamento") : "Escolha uma meta maior para continuar"}</div></div>
      </div>

      <div className="card section">
        <h2>Semana a semana</h2>
        <p className="sub">O que já foi feito em cada semana e quanto precisa entrar nas próximas para chegar em {mil(goal)}. O que falta é repartido pelos dias úteis que restam até {fmtDM(s.close)}.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Semana</th><th className="r">Dias úteis</th><th className="r">Já feito</th><th className="r">Precisa fazer</th><th className="r">Por dia útil</th><th className="r">Em disparos</th><th className="r">Disparos/dia</th></tr></thead>
            <tbody>
              {plan.weeks.map((w) => (
                <tr key={w.start} className={w.state === "now" ? "fin-now" : w.state === "past" ? "fin-past" : ""}>
                  <td><b>{fmtDM(w.start)} a {fmtDM(w.end)}</b>{w.state === "now" && <span className="pill good" style={{ marginLeft: 8 }}><i aria-hidden />esta semana</span>}</td>
                  <td className="r num">{w.state === "past" ? w.workdays : w.left === w.workdays ? w.workdays : `${w.left} de ${w.workdays}`}</td>
                  <td className="r num">{w.state === "next" ? "—" : fmtMoney(w.done)}</td>
                  <td className="r num">{w.plan > 0 ? <b>{fmtMoney(w.plan)}</b> : "—"}</td>
                  <td className="r num">{w.plan > 0 && w.left ? fmtMoney(w.plan / w.left) : "—"}</td>
                  <td className="r num">{w.plan > 0 ? fmtInt(w.planShots) : "—"}</td>
                  <td className="r num">{w.plan > 0 && w.left ? fmtInt(Math.ceil(w.planShots / w.left)) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td><b>Total</b></td><td className="r num">{s.workLeft} restantes</td><td className="r num"><b>{fmtMoney(s.forecast)}</b></td><td className="r num"><b>{fmtMoney(plan.missing)}</b></td><td className="r num">{plan.missing > 0 && s.workLeft ? fmtMoney(plan.perDay) : "—"}</td><td className="r num">{plan.missing > 0 ? fmtInt(plan.shotsTotal) : "—"}</td><td className="r num">{plan.missing > 0 && s.workLeft ? fmtInt(plan.shotsPerDay) : "—"}</td></tr></tfoot>
          </table>
        </div>
        {open && s.workLeft === 0 && plan.missing > 0 && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Não há mais dias úteis até o fechamento. Confira os dias de trabalho em Ajustes.</p>}
      </div>

      <div className="grid two section">
        <div className="card">
          <h2>Caminho até a meta</h2>
          <p className="sub">Linha cheia: o que já entrou. Tracejadas: para onde vai no ritmo atual e o caminho que leva à meta.</p>
          <TrackChart data={points} goals={[...new Set([...goalValues, goal])]} goal={goal} today={s.isCurrent ? s.today : null} />
        </div>
        <div className="card">
          <h2>Simulador</h2>
          <p className="sub">Mexa nos números para ver onde o mês fecha. Não altera nenhum lançamento.</p>
          <div className="fin-form">
            <label className="field"><span>Preço por disparo (R$)</span><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
            <label className="field"><span>Custo por entregue (R$)</span><input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
            <label className="field"><span>Taxa de entrega (%)</span><input inputMode="decimal" value={delivery} onChange={(e) => setDelivery(e.target.value)} /></label>
            <div className="field"><span>Lucro por disparo</span><div className="fin-out num">{fmtMoney4(perShot)}</div></div>
            <label className="field"><span>Disparos por dia útil</span><input inputMode="numeric" value={perDayShots} onChange={(e) => setPerDayShots(e.target.value)} placeholder={plan.missing > 0 ? `Para a meta: ${fmtInt(plan.shotsPerDay)}` : "Ex.: 5000"} /></label>
            <label className="field"><span>Entradas extras (R$)</span><input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Consultoria, serviço…" /></label>
          </div>
          <div className="fin-calc">
            <div><span>Dias úteis restantes</span><b className="num">{s.workLeft}</b></div>
            <div><span>Lucro novo</span><b className="num">{fmtMoney(simEnd - s.forecast)}</b></div>
            <div className="hl"><span>Mês fecha em</span><b className="num">{fmtMoney(simEnd)}</b></div>
            <div><span>{simGap > 0 ? "Falta para a meta" : "Passa da meta em"}</span><b className={`num ${simGap > 0 ? "err" : "ok"}`}>{fmtMoney(Math.abs(simGap))}</b></div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>Com desconto para {fmtMoney4(Math.max(0, dec(price) - 0.01))}, o lucro por disparo cai para {fmtMoney4(Math.max(0, perShot - 0.01))} ({fmtPct(perShot > 0 ? -0.01 / perShot : 0)}).</p>
        </div>
      </div>
    </>
  );
}
