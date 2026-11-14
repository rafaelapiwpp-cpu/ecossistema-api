"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FRONTS, FRONT_COLOR, KIND_LABEL, fmtDM, type DayRow, type Front } from "@/lib/finance";
import { fmtMoney } from "@/lib/format";

const compact = (n: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const axis = { stroke: "var(--text-3)", fontSize: 11, tickLine: false, axisLine: false } as const;

type Series = { key: string; label: string; color: string; dash?: boolean };

function Tip({ active, payload, label, series, total }: any) {
  if (!active || !payload?.length) return null;
  const rows = (series as Series[]).map((s) => ({ s, p: payload.find((x: any) => x.dataKey === s.key) })).filter((x) => x.p && x.p.value != null && (x.p.value !== 0 || !total));
  if (!rows.length) return null;
  const sum = rows.reduce((a, x) => a + (x.p.value || 0), 0);
  return (
    <div className="tooltip">
      <div className="t">{fmtDM(label)}</div>
      {rows.map(({ s, p }) => (
        <div className="row" key={s.key}><span><i style={{ background: s.color }} />{s.label}</span><span className="num">{fmtMoney(p.value)}</span></div>
      ))}
      {total && rows.length > 1 && <div className="row" style={{ marginTop: 4, fontWeight: 600 }}><span>Total do dia</span><span className="num">{fmtMoney(sum)}</span></div>}
    </div>
  );
}

function Legend({ series }: { series: Series[] }) {
  return <div className="legend">{series.map((s) => <span key={s.key}><i style={s.dash ? { background: "transparent", border: `1.5px dashed ${s.color}` } : { background: s.color }} />{s.label}</span>)}</div>;
}

export type TrackPoint = { day: string; real: number | null; pace: number | null; plan: number | null };

/** Acumulado do mês: o que já entrou, para onde vai no ritmo atual e o caminho até a meta escolhida. */
export function TrackChart({ data, goals, goal, today }: { data: TrackPoint[]; goals: number[]; goal: number; today: string | null }) {
  const series: Series[] = [
    { key: "real", label: "Realizado", color: "var(--series-2)" },
    { key: "pace", label: "No ritmo atual", color: "var(--text-3)", dash: true },
    { key: "plan", label: "Caminho até a meta", color: "var(--accent)", dash: true },
  ];
  const shown = series.filter((s) => data.some((d) => (d as any)[s.key] != null));
  const max = Math.max(goal, ...data.map((d) => Math.max(d.real || 0, d.pace || 0, d.plan || 0)));
  return (
    <>
      <Legend series={shown} />
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 14, right: 12, left: -4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="day" tickFormatter={fmtDM} {...axis} minTickGap={28} />
          <YAxis tickFormatter={(v) => `R$${compact(v)}`} {...axis} width={64} domain={[0, Math.ceil((max * 1.06) / 1000) * 1000]} />
          <Tooltip content={<Tip series={series} />} cursor={{ stroke: "var(--text-3)", strokeDasharray: "3 3" }} />
          {goals.filter((g) => g <= max * 1.06).map((g) => (
            <ReferenceLine key={g} y={g} stroke={g === goal ? "var(--accent)" : "var(--border-strong)"} strokeDasharray="2 4"
              label={{ value: `Meta ${compact(g)}`, position: "insideTopLeft", fill: g === goal ? "var(--accent)" : "var(--text-3)", fontSize: 11 }} />
          ))}
          {today && <ReferenceLine x={today} stroke="var(--border-strong)" label={{ value: "hoje", position: "insideBottomRight", fill: "var(--text-3)", fontSize: 11 }} />}
          <Line type="monotone" dataKey="pace" stroke="var(--text-3)" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="plan" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} connectNulls />
          <Line type="stepAfter" dataKey="real" stroke="var(--series-2)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

/** Lucro de cada dia, empilhado por frente. Clique numa barra para ver os lançamentos do dia. */
export function DailyChart({ days, fronts, onPick }: { days: DayRow[]; fronts: Front[]; onPick?: (day: string) => void }) {
  const series: Series[] = FRONTS.filter((f) => fronts.includes(f)).map((f) => ({ key: f, label: KIND_LABEL[f], color: FRONT_COLOR[f] }));
  return (
    <>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={days} margin={{ top: 6, right: 8, left: -4, bottom: 0 }} barCategoryGap={3}
          onClick={(st: any) => { if (onPick && st?.activeLabel) onPick(String(st.activeLabel)); }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="day" tickFormatter={fmtDM} {...axis} minTickGap={24} />
          <YAxis tickFormatter={(v) => `R$${compact(v)}`} {...axis} width={64} />
          <Tooltip content={<Tip series={series} total />} cursor={{ fill: "var(--fill-2)" }} />
          {series.map((s) => <Bar key={s.key} dataKey={s.key} stackId="d" fill={s.color} stroke="var(--surface)" strokeWidth={1} radius={2} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
