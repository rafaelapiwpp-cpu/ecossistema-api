export type PeriodKey = "7d" | "30d" | "90d" | "mes" | "mes_passado";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "mes", label: "Este mês" },
  { key: "mes_passado", label: "Mês passado" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

function todaySP() {
  // data de hoje no fuso de São Paulo
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${s}T00:00:00Z`);
}

export function resolvePeriod(key: string | undefined) {
  const k = (PERIODS.find((p) => p.key === key)?.key || "30d") as PeriodKey;
  const today = todaySP();
  let from: Date, to: Date;
  if (k === "mes") {
    from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    to = today;
  } else if (k === "mes_passado") {
    from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  } else {
    const n = k === "7d" ? 7 : k === "30d" ? 30 : 90;
    to = today;
    from = new Date(today.getTime() - (n - 1) * 86400000);
  }
  const len = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const prevTo = new Date(from.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (len - 1) * 86400000);
  const days: string[] = [];
  for (let d = from.getTime(); d <= to.getTime(); d += 86400000) days.push(iso(new Date(d)));
  return { key: k, from: iso(from), to: iso(to), prevFrom: iso(prevFrom), prevTo: iso(prevTo), days };
}
