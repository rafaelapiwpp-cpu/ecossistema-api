import { NextResponse } from "next/server";
import { db, query } from "@/lib/db";
import { requireSession } from "@/lib/guard";
import { DEFAULT_CONFIG, type Config, type Entry, type Fixed } from "@/lib/finance";

export const dynamic = "force-dynamic";

// Financeiro: só o Master lê e grava. Os números ficam no banco (nunca no código: o repositório é público).

const KINDS = ["gf7", "bm", "consultoria", "servico"];
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const num = (v: unknown, max = 1e9) => { const n = Number(typeof v === "string" ? v.replace(",", ".") : v); return isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };
const int = (v: unknown) => Math.round(num(v, 1e8));
const txt = (v: unknown, max = 160) => String(v ?? "").trim().slice(0, max);

const ENTRY_COLS = `id, kind, month, to_char(day, 'YYYY-MM-DD') as day, client, title, volume, delivered,
  price::float8 as price, unit_cost::float8 as unit_cost, amount::float8 as amount, paid, cost_paid,
  to_char(due, 'YYYY-MM-DD') as due, note`;

function cleanConfig(raw: any): Config {
  const d = DEFAULT_CONFIG, c = raw && typeof raw === "object" ? raw : {};
  const pos = (v: unknown, def: number, max: number) => { const n = num(v, max); return n > 0 ? n : def; };
  const workdays = Array.isArray(c.workdays) ? [...new Set<number>(c.workdays.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : d.workdays;
  return {
    firstGoal: pos(c.firstGoal, d.firstGoal, 1e8), step: pos(c.step, d.step, 1e8), monthGoal: pos(c.monthGoal, d.monthGoal, 1e8),
    closingDay: c.closingDay === undefined ? d.closingDay : Math.min(28, int(c.closingDay)),
    price: pos(c.price, d.price, 100), unitCost: c.unitCost === undefined ? d.unitCost : num(c.unitCost, 100),
    workdays: workdays.length ? workdays : d.workdays,
    holidays: Array.isArray(c.holidays) ? [...new Set<string>(c.holidays.filter(isDay))].sort().slice(0, 200) : [],
    accounts: Array.isArray(c.accounts) ? c.accounts.slice(0, 30).map((a: any) => ({ name: txt(a?.name, 60), balance: isFinite(Number(a?.balance)) ? Math.round(Math.max(-1e10, Math.min(1e10, Number(a.balance))) * 100) / 100 : 0 })).filter((a: { name: string }) => a.name) : [],
    cashAt: isDay(c.cashAt) ? c.cashAt : null,
  };
}

/** Lançamento conferido (ou a mensagem do que falta). */
function cleanEntry(b: any, cfg: Config): Omit<Entry, "id"> | string {
  const kind = String(b.kind || "");
  if (!KINDS.includes(kind)) return "Escolha o tipo do lançamento";
  if (!isDay(b.day)) return "Informe a data";
  const month = isMonth(b.month) ? b.month : b.day.slice(0, 7);
  const shot = kind === "gf7" || kind === "bm";
  const volume = shot ? int(b.volume) : 0;
  const delivered = shot ? int(b.delivered) : 0;
  const amount = volume > 0 ? 0 : num(b.amount);
  if (shot && !volume && !amount) return "Informe os disparos cobrados (ou o valor fechado)";
  if (!shot && !amount) return "Informe o valor";
  return {
    kind: kind as Entry["kind"], month, day: b.day, client: txt(b.client), title: txt(b.title), volume, delivered,
    price: volume ? (b.price === undefined || b.price === "" ? cfg.price : num(b.price, 100)) : 0,
    unit_cost: shot && delivered ? (b.unit_cost === undefined || b.unit_cost === "" ? cfg.unitCost : num(b.unit_cost, 100)) : 0,
    amount, paid: Boolean(b.paid), cost_paid: Boolean(b.cost_paid), due: isDay(b.due) ? b.due : null, note: txt(b.note, 500),
  };
}

function cleanFixed(b: any): Omit<Fixed, "id"> | string {
  const client = txt(b.client), amount = num(b.amount);
  if (!client || !amount) return "Informe o cliente e o valor mensal";
  if (!isMonth(b.start_month)) return "Informe o mês de início";
  return { client, amount, active: b.active === undefined ? true : Boolean(b.active), start_month: b.start_month, end_month: isMonth(b.end_month) ? b.end_month : null };
}

const ENTRY_FIELDS = ["kind", "month", "day", "client", "title", "volume", "delivered", "price", "unit_cost", "amount", "paid", "cost_paid", "due", "note"] as const;
const entryValues = (e: Omit<Entry, "id">) => ENTRY_FIELDS.map((k) => e[k]);
const INSERT_ENTRY = `insert into fin_entries (${ENTRY_FIELDS.join(", ")}) values (${ENTRY_FIELDS.map((_, i) => `$${i + 1}`).join(", ")}) returning id`;

async function load() {
  const [entries, fixed, cfg] = await Promise.all([
    query<Entry>(`select ${ENTRY_COLS} from fin_entries order by day, id`),
    query<Fixed>("select id, client, amount::float8 as amount, active, start_month, end_month from fin_fixed order by id"),
    query<{ data: any }>("select data from fin_config where id = 1"),
  ]);
  return { entries, fixed, config: cleanConfig(cfg[0]?.data) };
}

export async function GET() {
  const r = await requireSession({ master: true });
  if ("res" in r) return r.res;
  return NextResponse.json(await load());
}

export async function POST(req: Request) {
  const r = await requireSession({ master: true });
  if ("res" in r) return r.res;
  const b = await req.json().catch(() => ({}));
  const bad = (m: string, code = 400) => NextResponse.json({ error: m }, { status: code });
  const id = Number(b.id) || 0;
  try {
    const cfg = cleanConfig((await query<{ data: any }>("select data from fin_config where id = 1"))[0]?.data);
    switch (b.action) {
      case "entry_save": {
        const e = cleanEntry(b, cfg);
        if (typeof e === "string") return bad(e);
        if (id) {
          const sets = ENTRY_FIELDS.map((k, i) => `${k} = $${i + 2}`).join(", ");
          const done = await query(`update fin_entries set ${sets}, updated_at = now() where id = $1 returning id`, [id, ...entryValues(e)]);
          if (!done.length) return bad("Lançamento não encontrado", 404);
        } else await query(INSERT_ENTRY, entryValues(e));
        break;
      }
      case "entry_flag": {
        // marca recebido do cliente / pago ao fornecedor sem abrir o lançamento
        if (typeof b.paid === "boolean") await query("update fin_entries set paid = $2, updated_at = now() where id = $1", [id, b.paid]);
        if (typeof b.cost_paid === "boolean") await query("update fin_entries set cost_paid = $2, updated_at = now() where id = $1", [id, b.cost_paid]);
        break;
      }
      case "entry_delete":
        await query("delete from fin_entries where id = $1", [id]);
        break;
      case "fixed_save": {
        const f = cleanFixed(b);
        if (typeof f === "string") return bad(f);
        const v = [f.client, f.amount, f.active, f.start_month, f.end_month];
        if (id) await query("update fin_fixed set client = $2, amount = $3, active = $4, start_month = $5, end_month = $6 where id = $1", [id, ...v]);
        else await query("insert into fin_fixed (client, amount, active, start_month, end_month) values ($1, $2, $3, $4, $5)", v);
        break;
      }
      case "fixed_delete":
        await query("delete from fin_fixed where id = $1", [id]);
        break;
      case "config_save":
        await query("insert into fin_config (id, data) values (1, $1::jsonb) on conflict (id) do update set data = excluded.data", [cleanConfig({ ...cfg, ...(b.config && typeof b.config === "object" ? b.config : {}) }) as any]); // junta com o que já existe; objeto: o driver já serializa como JSON
        break;
      case "import": {
        // arquivo de cópia/importação: { entries, fixed, config? }; "replace" troca tudo o que existe
        const entries = Array.isArray(b.entries) ? b.entries.slice(0, 5000) : [];
        const fixed = Array.isArray(b.fixed) ? b.fixed.slice(0, 500) : [];
        const newCfg = b.config ? cleanConfig({ ...cfg, ...b.config }) : null;
        const es = entries.map((x: any) => cleanEntry(x, newCfg || cfg));
        const fs = fixed.map(cleanFixed);
        const wrong = [...es, ...fs].find((x) => typeof x === "string");
        if (wrong) return bad(`Arquivo com lançamento incompleto: ${wrong}`);
        if (!es.length && !fs.length && !newCfg) return bad("O arquivo não tem lançamentos");
        await db().begin(async (sql) => {
          if (b.replace) { await sql.unsafe("delete from fin_entries"); await sql.unsafe("delete from fin_fixed"); }
          for (const e of es as Omit<Entry, "id">[]) await sql.unsafe(INSERT_ENTRY, entryValues(e) as any[]);
          for (const f of fs as Omit<Fixed, "id">[]) await sql.unsafe("insert into fin_fixed (client, amount, active, start_month, end_month) values ($1, $2, $3, $4, $5)", [f.client, f.amount, f.active, f.start_month, f.end_month] as any[]);
          if (newCfg) await sql.unsafe("insert into fin_config (id, data) values (1, $1::jsonb) on conflict (id) do update set data = excluded.data", [newCfg as any]);
        });
        break;
      }
      default:
        return bad("Ação inválida");
    }
    return NextResponse.json({ ok: true, ...(await load()) });
  } catch (e: any) {
    return bad(e?.message || "Falha ao salvar", 500);
  }
}
