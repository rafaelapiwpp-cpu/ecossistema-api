import { hasDb, query } from "./db";
import { demoDataset } from "./demo";
import type { Dataset } from "./types";

/** Carrega tudo a partir de `fromDay` (inclui o período anterior para comparação). */
export async function loadDataset(fromDay: string, opts: { failures?: boolean } = {}): Promise<Dataset> {
  if (!hasDb()) return demoDataset();
  try {
  const [wabas, phones, templates, messages, costs, templateDaily, failures, syncs] = await Promise.all([
    query("select * from wabas order by name nulls last, id"),
    query("select * from phone_numbers order by display_phone_number"),
    query("select * from templates order by name"),
    query("select waba_id, phone_digits, to_char(day, 'YYYY-MM-DD') as day, sent, delivered from daily_messages where day >= $1", [fromDay]),
    query("select waba_id, to_char(day, 'YYYY-MM-DD') as day, pricing_category, pricing_type, country, volume, cost from daily_costs where day >= $1", [fromDay]),
    query("select template_id, waba_id, to_char(day, 'YYYY-MM-DD') as day, sent, delivered, read, clicks, cost from template_daily where day >= $1", [fromDay]),
    opts.failures === false
      ? Promise.resolve([])
      : query("select * from message_events where status = 'failed' and ts >= $1 order by ts desc limit 2000", [`${fromDay}T00:00:00Z`]),
    query("select * from sync_runs order by started_at desc limit 1"),
  ]);
  const num = (rows: any[], keys: string[]) => rows.map((r) => { for (const k of keys) r[k] = Number(r[k] || 0); return r; });
  const iso = (rows: any[], keys: string[]) => rows.map((r) => { for (const k of keys) if (r[k] instanceof Date) r[k] = r[k].toISOString(); return r; });
  return {
    demo: false,
    wabas,
    phones,
    templates,
    messages: num(messages, ["sent", "delivered"]),
    costs: num(costs, ["volume", "cost"]),
    templateDaily: num(templateDaily, ["sent", "delivered", "read", "clicks", "cost"]),
    failures: iso(failures, ["ts"]),
    lastSync: iso(syncs, ["started_at", "finished_at"])[0] || null,
  };
  } catch (e: any) {
    if (e?.code === "42P01") { // banco ainda vazio (antes da primeira configuração)
      return { demo: false, wabas: [], phones: [], templates: [], messages: [], costs: [], templateDaily: [], failures: [], lastSync: null };
    }
    throw e;
  }
}
