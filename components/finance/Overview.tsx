"use client";
import { useMemo } from "react";
import { FRONTS, FRONT_COLOR, KIND_LABEL, fmtDM, planFor, revenueOf, type Summary } from "@/lib/finance";
import { fmtInt, fmtMoney, fmtMoney4, fmtPct } from "@/lib/format";
import { TrackChart, type TrackPoint } from "./FinCharts";
import type { FinProps } from "./Finance";

const mil = (n: number) => `R$ ${String(n / 1000).replace(".", ",")} mil`;

/** Pontos do gráfico acumulado: realizado até hoje e, daí em diante, ritmo atual e caminho até a meta. */
export function trackPoints(s: Summary, perDay: number): TrackPoint[] {
  let n = 0;
  return s.days.map((d) => {
    const ahead = !s.isPast && d.day >= s.today;
    if (ahead && d.day > s.today && d.work) n++;
    return {
      day: d.day, real: d.acc,
      pace: ahead && s.pace > 0 ? Math.round(s.forecast + s.pace * n) : null,
      plan: ahead && perDay > 0 ? Math.round(s.forecast + perDay * n) : null,
    };
  });
}

/** Frase do topo: parabéns ao bater uma meta; antes disso, incentivo conforme o caminho até a próxima. */
function Cheer({ s }: { s: Summary }) {
  const base = s.lastHit, span = Math.max(1, s.nextGoal - base);
  const done = s.forecast >= s.nextGoal ? 1 : Math.max(0, (s.forecast - (s.lastHit ? base : 0)) / (s.lastHit ? span : s.nextGoal));
  if (s.lastHit > 0 && done < 0.35) return <div className="fin-cheer win"><span aria-hidden>🎉</span><p><b>Parabéns, Rafael! Você atingiu a meta de {mil(s.lastHit)}.</b> Bora buscar a próxima.</p></div>;
  const [ico, text] = done >= 0.92 ? ["⚡", "Tá quase, Rafa! Falta pouco pra bater a próxima meta."] : done >= 0.35 ? ["🔥", "As vendas não param, Rafa. Pra cima!"] : ["🚀", "Bora, Rafa! O mês tá só começando."];
  return <div className="fin-cheer"><span aria-hidden>{ico}</span><p>{text}</p></div>;
}

export default function Overview({ s, data, openEntry, goal, setGoal, goTo }: FinProps & { goTo: (tab: string) => void }) {
  const plan = useMemo(() => planFor(s, goal, s.shots.perShot), [s, goal]);
  const points = useMemo(() => trackPoints(s, plan.perDay), [s, plan.perDay]);
  const toNext = Math.max(0, s.nextGoal - s.forecast);
  const from = s.lastHit, pct = Math.min(1, Math.max(0, (s.forecast - from) / Math.max(1, s.nextGoal - from)));
  const fronts = FRONTS.filter((f) => s.byFront[f] !== 0);
  const open = !s.isPast;

  return (
    <>
      <div className="card fin-hero">
        {open && <Cheer s={s} />}
        <div className="fin-hero-row">
          <div className="fin-hero-main">
            <div className="label">{open ? "Previsão do mês" : "Resultado do mês"}</div>
            <div className="fin-big num">{fmtMoney(s.forecast)}</div>
            <div className="muted">{s.isCurrent ? <>Hoje: <b className="num">{fmtMoney(s.todayProfit)}</b> de lucro · {s.workLeft} dias úteis até fechar ({fmtDM(s.close)})</> : <>Período de {fmtDM(s.start)} a {fmtDM(s.close)}</>}</div>
          </div>
          <div className="fin-hero-goal">
            <div className="label">Próxima meta: {mil(s.nextGoal)}</div>
            <div className="fin-goal-txt">Faltam <b className="num">{fmtMoney(toNext)}</b> · {fmtPct(pct)} do caminho</div>
            <div className="fin-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}><i style={{ width: `${pct * 100}%` }} /></div>
            <div className="fin-goals">
              {s.goals.map((g) => (
                <button key={g.value} type="button" className={`${g.hit ? "hit" : ""} ${g.value === goal ? "on" : ""}`} onClick={() => setGoal(g.value)} title="Ver o plano para esta meta">
                  {g.hit ? "✓ " : ""}{mil(g.value)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <TrackChart data={points} goals={s.goals.map((g) => g.value)} goal={goal} today={s.isCurrent ? s.today : null} />
      </div>

      {open && (
        <div className="grid fin-three section">
          <div className="card kpi"><div className="label">Se parar hoje</div><div className="value num">{fmtMoney(s.forecast)}</div><div className="delta">O que já está garantido no mês</div></div>
          <div className="card kpi"><div className="label">No ritmo atual</div><div className="value num">{fmtMoney(s.atPace)}</div><div className="delta">{fmtMoney(s.pace)} de lucro em disparos por dia útil</div></div>
          <button type="button" className="card kpi fin-kpi-link" onClick={() => goTo("plano")}>
            <div className="label">Para a meta de {mil(goal)}</div>
            <div className="value num">{plan.missing > 0 ? `${fmtMoney(plan.perDay)}/dia` : "Meta batida"}</div>
            <div className="delta">{plan.missing > 0 ? <>≈ {fmtInt(plan.shotsPerDay)} disparos por dia útil · ver o plano</> : "Escolha a próxima meta ali em cima"}</div>
          </button>
        </div>
      )}

      <div className="grid two section">
        <div className="card">
          <h2>De onde vem o resultado</h2>
          <p className="sub">Lucro de cada frente no mês</p>
          <div className="fin-fronts">
            {fronts.map((f) => (
              <div key={f} className="fin-front">
                <div className="fin-front-top"><span><i style={{ background: FRONT_COLOR[f] }} />{KIND_LABEL[f]}</span><span className="num"><b>{fmtMoney(s.byFront[f])}</b> · {fmtPct(s.forecast ? s.byFront[f] / s.forecast : 0)}</span></div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${s.forecast > 0 ? Math.max(0, (s.byFront[f] / s.forecast) * 100) : 0}%`, background: FRONT_COLOR[f] }} /></div>
              </div>
            ))}
            {!fronts.length && <div className="empty">Nada lançado neste mês</div>}
          </div>
        </div>
        <div className="card">
          <h2>A receber e a pagar</h2>
          <p className="sub">O que ainda não entrou e o que falta acertar</p>
          <div className="fin-duo">
            <div><span className="label">A receber</span><b className="num">{fmtMoney(s.receivable)}</b></div>
            <div><span className="label">A pagar (custo dos disparos)</span><b className="num">{fmtMoney(s.payable)}</b></div>
          </div>
          <div className="fin-list">
            {s.receivableList.slice(0, 5).map((e) => (
              <button key={e.id} type="button" onClick={() => openEntry(e)}>
                <span><b>{e.client || e.title || "Sem nome"}</b><small>{e.title && e.client ? `${e.title} · ` : ""}{e.due ? `receber em ${fmtDM(e.due)}` : `de ${fmtDM(e.day)}`}</small></span>
                <span className="num">{fmtMoney(revenueOf(e))}</span>
              </button>
            ))}
            {!s.receivableList.length && <div className="muted" style={{ fontSize: 13 }}>Tudo recebido. 👏</div>}
            {s.receivableList.length > 5 && <button type="button" className="more" onClick={() => goTo("lanc")}>Ver os {s.receivableList.length} em aberto</button>}
          </div>
        </div>
      </div>

      <div className="card section">
        <h2>Disparos: os centavos de cada mensagem</h2>
        <p className="sub">Média das {s.shots.count} campanhas lançadas com volume neste mês{s.shots.count ? "" : ` (sem campanhas: vale o padrão dos Ajustes, ${fmtMoney4(data.config.price)} e ${fmtMoney4(data.config.unitCost)})`}</p>
        <div className="fin-strip">
          <div><span className="label">Lucro líquido</span><b className="num">{fmtMoney(s.shots.profit)}</b><small>margem de {fmtPct(s.shots.margin)}</small></div>
          <div><span className="label">Faturamento</span><b className="num">{fmtMoney(s.shots.revenue)}</b><small>{fmtInt(s.shots.volume)} disparos cobrados</small></div>
          <div><span className="label">Custo</span><b className="num">{fmtMoney(s.shots.cost)}</b><small>{fmtInt(s.shots.delivered)} entregues ({fmtPct(s.shots.delivery)})</small></div>
          <div><span className="label">Cobrado por disparo</span><b className="num">{fmtMoney4(s.shots.price)}</b><small>preço médio</small></div>
          <div><span className="label">Lucro por disparo</span><b className="num">{fmtMoney4(s.shots.perShot)}</b><small>por disparo cobrado</small></div>
        </div>
      </div>
    </>
  );
}
