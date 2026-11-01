/** Formatação pt-BR usada em toda a interface. Fuso de exibição: America/Sao_Paulo. */

const TZ = "America/Sao_Paulo";

const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatInt(n: number): string {
  return int.format(n);
}

/** 84.210 -> "84,2 mil"; 1.250.000 -> "1,25 mi"; abaixo de 10 mil mostra inteiro. */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: v >= 10 ? 1 : 2 }).format(v)} mi`;
  }
  if (abs >= 10_000) {
    const v = n / 1_000;
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: v >= 100 ? 0 : 1 }).format(v)} mil`;
  }
  return int.format(n);
}

/** 0.9726 -> "97,3%"; casas decimais ajustáveis. */
export function formatPercent(ratio: number, digits = 1): string {
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ratio * 100)}%`;
}

/** Variação relativa com sinal tipográfico: "+6%" / "−22%". */
export function formatDelta(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const d = (current - previous) / previous;
  const v = Math.round(Math.abs(d) * 100);
  if (v === 0) return "estável";
  return `${d > 0 ? "+" : "−"}${v}%`;
}

/** "+5551900001001" -> "(51) 90000-1001" */
export function formatPhone(e164: string): string {
  const m = e164.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function lastDigits(e164: string, n = 4): string {
  return e164.slice(-n);
}

/** "há 3 min", "há 5 h", "há 2 dias" relativo a `now`. */
export function formatAgo(iso: string, now: Date): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.round(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/** "31 out., 23:00" */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso))
    .replace(" de ", " ")
    .replace(" às ", ", ");
}

/** Rótulo curto de eixo para "YYYY-MM-DD": { weekday: "sáb", day: "31" } */
export function dayParts(date: string): { weekday: string; day: string; long: string } {
  const d = new Date(`${date}T12:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" }).format(d).replace(".", "");
  const long = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(d);
  return { weekday, day: String(d.getUTCDate()), long: long.charAt(0).toUpperCase() + long.slice(1) };
}

export { oneDecimal };
