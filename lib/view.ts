import { loadDataset } from "./data";
import { query } from "./db";
import { requirePage } from "./guard";
import { resolvePeriod } from "./period";
import type { Dataset } from "./types";
import { getScope, type Scope } from "./access";

export type SP = Promise<Record<string, string | string[] | undefined>>;

/** Só o que o usuário pode ver: contas das BMs do seu escopo (e o relatório da sincronização delas). */
function restrict(d: Dataset, scope: Scope): Dataset {
  if (scope.all) return d;
  const ok = new Set(scope.wabas);
  const mine = <T extends { waba_id: string | null }>(rows: T[]) => rows.filter((r) => !!r.waba_id && ok.has(String(r.waba_id)));
  const conns = new Set(scope.conns);
  let lastSync = d.lastSync;
  if (lastSync?.details && Array.isArray((lastSync.details as any).log)) {
    const log = ((lastSync.details as any).log as { ok: boolean; conn?: number }[]).filter((l) => !l.conn || conns.has(l.conn));
    lastSync = { ...lastSync, ok: !log.some((l) => !l.ok), details: { ...(lastSync.details as any), log } };
  }
  return {
    ...d,
    wabas: d.wabas.filter((w) => ok.has(String(w.id))),
    phones: mine(d.phones), templates: mine(d.templates), messages: mine(d.messages), costs: mine(d.costs),
    templateDaily: mine(d.templateDaily), failures: mine(d.failures), lastSync,
  };
}

export async function getView(searchParams: SP, opts: { failures?: boolean } = {}) {
  const session = await requirePage();
  const sp = await searchParams;
  const period = resolvePeriod(typeof sp.p === "string" ? sp.p : undefined);
  const raw = await loadDataset(period.prevFrom, opts);
  const scope = session ? await getScope(session.user) : null; // sem sessão = modo demonstração
  const all = scope ? restrict(raw, scope) : raw;
  const asked = typeof sp.waba === "string" ? sp.waba : "";
  const wabaId = asked && all.wabas.some((w) => w.id === asked) ? asked : ""; // conta fora do escopo = ignorada
  // números que este usuário acompanha (interruptor em Conexões): com algum marcado, a Visão geral mostra só eles
  // (as métricas da Meta são por conta, então a seleção vira o conjunto das contas desses números); ?n=todos mostra tudo
  const watchedIds = session ? await watchedPhones(session.user.id) : [];
  const watchedHere = all.phones.filter((p) => watchedIds.includes(p.id));
  const showAll = sp.n === "todos";
  const watch = { ids: watchedHere.map((p) => p.id), wabas: [...new Set(watchedHere.map((p) => String(p.waba_id)))], total: all.phones.length, active: !showAll && watchedHere.length > 0, showAll };
  const byWaba = <T extends { waba_id: string | null }>(rows: T[]) => {
    const r = wabaId ? rows.filter((x) => x.waba_id === wabaId) : rows;
    return watch.active ? r.filter((x) => !!x.waba_id && watch.wabas.includes(String(x.waba_id))) : r;
  };
  const inRange = <T extends { day: string }>(rows: T[], from: string, to: string) => rows.filter((r) => r.day >= from && r.day <= to);
  const ds: Dataset = {
    ...all,
    phones: watch.active ? all.phones.filter((p) => watch.ids.includes(p.id) && (!wabaId || p.waba_id === wabaId)) : byWaba(all.phones),
    templates: byWaba(all.templates),
    messages: byWaba(all.messages),
    costs: byWaba(all.costs),
    templateDaily: byWaba(all.templateDaily),
    failures: byWaba(all.failures),
  };
  const cur = {
    messages: inRange(ds.messages, period.from, period.to),
    costs: inRange(ds.costs, period.from, period.to),
    templateDaily: inRange(ds.templateDaily, period.from, period.to),
    failures: ds.failures.filter((f) => f.ts.slice(0, 10) >= period.from && f.ts.slice(0, 10) <= period.to),
  };
  const prev = {
    messages: inRange(ds.messages, period.prevFrom, period.prevTo),
    costs: inRange(ds.costs, period.prevFrom, period.prevTo),
    templateDaily: inRange(ds.templateDaily, period.prevFrom, period.prevTo),
    failures: ds.failures.filter((f) => f.ts.slice(0, 10) >= period.prevFrom && f.ts.slice(0, 10) <= period.prevTo),
  };
  const currency = (wabaId ? all.wabas.find((w) => w.id === wabaId)?.currency : all.wabas[0]?.currency) || "BRL";
  return { all, ds, cur, prev, period, wabaId, currency, session, scope, watch };
}

async function watchedPhones(userId: number): Promise<string[]> {
  try { return (await query<{ phone_number_id: string }>("select phone_number_id from user_watch_phones where user_id = $1", [userId])).map((x) => x.phone_number_id); }
  catch { return []; } // antes da migração
}

export const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + (f(r) || 0), 0);
