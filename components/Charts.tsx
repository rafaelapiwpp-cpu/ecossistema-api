"use client";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

const fmtDay = (d: string) => { const [, m, dd] = d.split("-"); return `${dd}/${m}`; };
const int = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n || 0));
const money = (n: number, c = "BRL") => new Intl.NumberFormat("pt-BR", { style: "currency", currency: c }).format(n || 0);
const compact = (n: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);

type Series = { key: string; label: string; color: string };

function Tip({ active, payload, label, series, kind, currency }: any) {
  if (!active || !payload?.length) return null;
  const total = kind === "money" ? payload.reduce((a: number, p: any) => a + (p.value || 0), 0) : null;
  return (
    <div className="tooltip">
      <div className="t">{fmtDay(label)}</div>
      {(series as Series[]).map((s) => {
        const p = payload.find((x: any) => x.dataKey === s.key);
        if (!p) return null;
        return (
          <div className="row" key={s.key}>
            <span><i style={{ background: s.color }} />{s.label}</span>
            <span className="num">{kind === "money" ? money(p.value, currency) : int(p.value)}</span>
          </div>
        );
      })}
      {total !== null && payload.length > 1 && (
        <div className="row" style={{ marginTop: 4, fontWeight: 600 }}><span>Total</span><span className="num">{money(total, currency)}</span></div>
      )}
    </div>
  );
}

function Legend({ series }: { series: Series[] }) {
  return (
    <div className="legend">
      {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
    </div>
  );
}

const axis = { stroke: "var(--text-3)", fontSize: 11, tickLine: false, axisLine: false } as const;

export function MessagesChart({ data }: { data: { day: string; sent: number; delivered: number }[] }) {
  const series: Series[] = [
    { key: "sent", label: "Enviadas", color: "var(--series-1)" },
    { key: "delivered", label: "Entregues", color: "var(--series-3)" },
  ];
  return (
    <>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="day" tickFormatter={fmtDay} {...axis} minTickGap={24} />
          <YAxis tickFormatter={compact} {...axis} width={60} />
          <Tooltip content={<Tip series={series} />} cursor={{ stroke: "var(--text-3)", strokeDasharray: "3 3" }} />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

const CAT_COLORS: Record<string, string> = {
  MARKETING: "var(--series-1)", UTILITY: "var(--series-2)", AUTHENTICATION: "var(--series-3)", OTHER: "var(--series-4)",
};
const CAT_LABEL: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação", OTHER: "Outros" };

export function CostChart({ data, keys, currency }: { data: Record<string, any>[]; keys: string[]; currency: string }) {
  const series: Series[] = keys.map((k) => ({ key: k, label: CAT_LABEL[k] || k, color: CAT_COLORS[k] || "var(--series-4)" }));
  return (
    <>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="day" tickFormatter={fmtDay} {...axis} minTickGap={24} />
          <YAxis tickFormatter={(v) => `R$${compact(v)}`} {...axis} width={72} />
          <Tooltip content={<Tip series={series} kind="money" currency={currency} />} cursor={{ fill: "var(--surface-2)" }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} stackId="c" fill={s.color} stroke="var(--surface)" strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
