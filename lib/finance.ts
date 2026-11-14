// Financeiro do Master: tipos e contas (sem dependências de servidor — a tela usa direto).
// Frentes: disparos pela GF7, disparos pela própria BM, consultoria, outros serviços e entradas fixas mensais.

export type Kind = "gf7" | "bm" | "consultoria" | "servico";
export type Front = Kind | "fixa";

export const KIND_LABEL: Record<Front, string> = {
  gf7: "Disparos (GF7)", bm: "Disparos (minha BM)", consultoria: "Consultoria", servico: "Outros serviços", fixa: "Entradas fixas",
};
export const FRONT_COLOR: Record<Front, string> = {
  gf7: "var(--series-2)", bm: "var(--series-4)", fixa: "var(--series-1)", consultoria: "var(--series-3)", servico: "var(--text-3)",
};
export const FRONTS: Front[] = ["gf7", "bm", "fixa", "consultoria", "servico"];
export const isDisparo = (k: string) => k === "gf7" || k === "bm";

export type Entry = {
  id: number; kind: Kind;
  /** Mês de competência (AAAA-MM): em que mês o lançamento conta. */
  month: string;
  /** Dia do serviço (AAAA-MM-DD). */
  day: string;
  client: string; title: string;
  /** Disparos: cobrados do cliente e entregues de verdade (base do custo). */
  volume: number; delivered: number; price: number; unit_cost: number;
  /** Valor fechado (consultoria, serviço, ou disparo lançado só pelo valor). */
  amount: number;
  paid: boolean; cost_paid: boolean;
  /** Data combinada para receber (AAAA-MM-DD) ou null. */
  due: string | null; note: string;
};
export type Fixed = { id: number; client: string; amount: number; active: boolean; start_month: string; end_month: string | null };
export type Config = {
  firstGoal: number; step: number; monthGoal: number;
  /** O mês conta até este dia do mês seguinte (0 = fecha no último dia). */
  closingDay: number;
  price: number; unitCost: number;
  /** Dias da semana trabalhados (0 = domingo … 6 = sábado). */
  workdays: number[];
  /** Feriados e folgas (AAAA-MM-DD). */
  holidays: string[];
};
export const DEFAULT_CONFIG: Config = {
  firstGoal: 20000, step: 5000, monthGoal: 30000, closingDay: 5, price: 0.27, unitCost: 0.15, workdays: [1, 2, 3, 4, 5], holidays: [],
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const revenueOf = (e: Entry) => r2(isDisparo(e.kind) && e.volume > 0 ? e.volume * e.price : e.amount);
export const costOf = (e: Entry) => r2(isDisparo(e.kind) ? e.delivered * e.unit_cost : 0);
export const profitOf = (e: Entry) => r2(revenueOf(e) - costOf(e));

// ---- datas (sempre texto AAAA-MM-DD, sem fuso) ----
const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
const toStr = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (d: string, n: number) => { const x = toDate(d); x.setUTCDate(x.getUTCDate() + n); return toStr(x); };
export const weekday = (d: string) => toDate(d).getUTCDay();
export const monthOf = (d: string) => d.slice(0, 7);
export const nextMonth = (m: string, n = 1) => { const [y, mm] = m.split("-").map(Number); const x = new Date(Date.UTC(y, mm - 1 + n, 1)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}`; };
export const lastDayOf = (m: string) => addDays(`${nextMonth(m)}-01`, -1);
/** Hoje em São Paulo (AAAA-MM-DD). */
export function todaySP(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return p.slice(0, 10);
}
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
export const fmtDM = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export type DayRow = { day: string; work: boolean; future: boolean; total: number; acc: number | null } & Record<Front, number>;
export type WeekRow = {
  start: string; end: string; workdays: number; left: number; done: number;
  /** Quanto falta fazer nesta semana para a meta (lucro) e em disparos; 0 nas semanas já encerradas. */
  plan: number; planShots: number; state: "past" | "now" | "next";
};
export type Summary = {
  month: string; start: string; close: string; today: string; isCurrent: boolean; isPast: boolean;
  entries: Entry[]; fixed: Fixed[];
  byFront: Record<Front, number>; forecast: number;
  shots: { revenue: number; cost: number; profit: number; margin: number; volume: number; delivered: number; price: number; perShot: number; delivery: number; count: number };
  receivable: number; receivableList: Entry[]; payable: number; payableList: Entry[];
  days: DayRow[]; todayProfit: number; bestDay: DayRow | null;
  goals: { value: number; hit: boolean }[]; nextGoal: number; lastHit: number;
  workElapsed: number; workLeft: number; pace: number; atPace: number;
  weeks: WeekRow[];
};

export const fixedIn = (f: Fixed, m: string) => f.active && f.start_month <= m && (!f.end_month || m <= f.end_month);
export const isWorkday = (d: string, c: Config) => c.workdays.includes(weekday(d)) && !c.holidays.includes(d);

/** Tudo o que a tela mostra de um mês: realizado por dia, frentes, metas e ritmo. */
export function summarize(all: Entry[], fixedAll: Fixed[], c: Config, month: string, today: string): Summary {
  const entries = all.filter((e) => e.month === month).sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id);
  const fixed = fixedAll.filter((f) => fixedIn(f, month));
  const start = `${month}-01`;
  const close = c.closingDay > 0 ? `${nextMonth(month)}-${pad(Math.min(28, c.closingDay))}` : lastDayOf(month);
  const isCurrent = today >= start && today <= close;
  const isPast = today > close;

  const byFront: Record<Front, number> = { gf7: 0, bm: 0, fixa: 0, consultoria: 0, servico: 0 };
  for (const e of entries) byFront[e.kind] = r2(byFront[e.kind] + profitOf(e));
  byFront.fixa = r2(fixed.reduce((a, f) => a + f.amount, 0));
  const forecast = r2(FRONTS.reduce((a, k) => a + byFront[k], 0));

  // números por disparo: só campanhas lançadas com volume (um disparo lançado só pelo valor não entra na média)
  const counted = entries.filter((e) => isDisparo(e.kind) && e.volume > 0);
  const revenue = r2(counted.reduce((a, e) => a + revenueOf(e), 0)), cost = r2(counted.reduce((a, e) => a + costOf(e), 0));
  const volume = counted.reduce((a, e) => a + e.volume, 0), delivered = counted.reduce((a, e) => a + e.delivered, 0);
  const shots = {
    revenue, cost, profit: r2(revenue - cost), margin: revenue ? (revenue - cost) / revenue : 0, volume, delivered,
    price: volume ? revenue / volume : c.price,
    perShot: volume ? (revenue - cost) / volume : c.price - c.unitCost,
    delivery: volume ? delivered / volume : 1, count: counted.length,
  };

  const receivableList = entries.filter((e) => !e.paid && revenueOf(e) > 0);
  const payableList = entries.filter((e) => !e.cost_paid && costOf(e) > 0);

  // dia a dia (cada lançamento no dia do serviço; fora do período encosta na borda; fixas no dia 1º)
  const days: DayRow[] = [];
  const idx = new Map<string, DayRow>();
  for (let d = start; d <= close; d = addDays(d, 1)) {
    const row: DayRow = { day: d, work: isWorkday(d, c), future: d > today, total: 0, acc: null, gf7: 0, bm: 0, fixa: 0, consultoria: 0, servico: 0 };
    days.push(row); idx.set(d, row);
  }
  for (const e of entries) {
    const row = idx.get(e.day < start ? start : e.day > close ? close : e.day)!;
    row[e.kind] = r2(row[e.kind] + profitOf(e));
  }
  days[0].fixa = byFront.fixa;
  let acc = 0;
  for (const row of days) {
    row.total = r2(FRONTS.reduce((a, k) => a + row[k], 0));
    acc = r2(acc + row.total);
    row.acc = row.future && !isPast ? null : acc;
  }
  const variable = (row: DayRow) => r2(row.total - row.fixa);
  const worked = days.filter((d) => !d.future && variable(d) !== 0);
  const bestDay = worked.length ? worked.reduce((a, b) => (variable(b) > variable(a) ? b : a)) : null;
  const todayProfit = isCurrent ? variable(idx.get(today)!) : 0;

  // metas: primeira, depois de passo em passo, até cobrir a meta do mês e a próxima
  const goals: { value: number; hit: boolean }[] = [];
  const step = Math.max(1, c.step);
  const top = Math.max(c.monthGoal, c.firstGoal, forecast + step);
  for (let v = c.firstGoal; v <= top + 0.001 && goals.length < 40; v += step) goals.push({ value: v, hit: forecast >= v });
  const nextGoal = goals.find((g) => !g.hit)?.value ?? goals[goals.length - 1].value + step;
  const lastHit = [...goals].reverse().find((g) => g.hit)?.value ?? 0;

  // ritmo: lucro dos disparos por dia útil já passado → projeção se continuar igual
  const workElapsed = days.filter((d) => d.work && !d.future).length;
  const workLeft = isPast ? 0 : days.filter((d) => d.work && d.day > today).length;
  const shotProfit = r2(byFront.gf7 + byFront.bm);
  const pace = workElapsed ? shotProfit / workElapsed : 0;
  const atPace = r2(forecast + pace * workLeft);

  return {
    month, start, close, today, isCurrent, isPast, entries, fixed, byFront, forecast, shots,
    receivable: r2(receivableList.reduce((a, e) => a + revenueOf(e), 0)), receivableList,
    payable: r2(payableList.reduce((a, e) => a + costOf(e), 0)), payableList,
    days, todayProfit, bestDay, goals, nextGoal, lastHit, workElapsed, workLeft, pace, atPace,
    weeks: weeksFor(days, today, isPast, 0, 1),
  };
}

/** Semanas (segunda a domingo) do período, com o que falta para a meta repartido pelos dias úteis que restam. */
export function weeksFor(days: DayRow[], today: string, isPast: boolean, missing: number, perShot: number): WeekRow[] {
  const left = (d: DayRow) => !isPast && d.work && d.day > today;
  const totalLeft = days.filter(left).length;
  const weeks: WeekRow[] = [];
  for (const d of days) {
    let w = weeks[weeks.length - 1];
    if (!w || weekday(d.day) === 1) { w = { start: d.day, end: d.day, workdays: 0, left: 0, done: 0, plan: 0, planShots: 0, state: "next" }; weeks.push(w); }
    w.end = d.day;
    if (d.work) w.workdays++;
    if (left(d)) w.left++;
    if (!d.future || isPast) w.done = r2(w.done + d.total);
  }
  for (const w of weeks) {
    w.state = isPast || w.end < today ? "past" : w.start > today ? "next" : "now";
    w.plan = totalLeft && missing > 0 ? r2((missing * w.left) / totalLeft) : 0;
    w.planShots = perShot > 0 ? Math.ceil(w.plan / perShot) : 0;
  }
  return weeks;
}

/** Plano para uma meta: quanto falta, por dia útil e por semana, em lucro e em disparos. */
export function planFor(s: Summary, goal: number, perShot: number) {
  const missing = Math.max(0, r2(goal - s.forecast));
  const perDay = s.workLeft ? missing / s.workLeft : missing;
  const shotsTotal = perShot > 0 ? Math.ceil(missing / perShot) : 0;
  return {
    goal, missing, perDay, shotsTotal, shotsPerDay: s.workLeft ? Math.ceil(shotsTotal / s.workLeft) : shotsTotal,
    weeks: weeksFor(s.days, s.today, s.isPast, missing, perShot),
    /** Mantendo o ritmo atual, chega? */
    reachable: s.atPace >= goal,
  };
}

/** Meses que têm algum lançamento (mais o atual), do mais novo para o mais antigo. */
export function monthsOf(all: Entry[], today: string, c: Config) {
  const cur = monthOf(today);
  // até o dia de fechamento, o mês anterior ainda está aberto
  const open = c.closingDay > 0 && Number(today.slice(8, 10)) <= c.closingDay ? nextMonth(cur, -1) : cur;
  const set = new Set<string>([cur, open, ...all.map((e) => e.month)]);
  return { list: [...set].sort().reverse(), open };
}
