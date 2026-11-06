import postgres, { type Sql } from "postgres";

let client: Sql | null = null;

export function dbUrl() {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
}

export function hasDb() {
  return Boolean(dbUrl());
}

export function db(): Sql {
  if (!hasDb()) throw new Error("Banco de dados não configurado (POSTGRES_URL)");
  if (!client) {
    const url = dbUrl();
    const local = /localhost|127\.0\.0\.1/.test(url);
    client = postgres(url, {
      ssl: local ? false : "require",
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false, // compatível com pooler em modo transação (Supabase/Neon)
      onnotice: () => {}, // "already exists, skipping" das migrações não precisa ir para o log
    });
  }
  return client;
}

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const rows = await db().unsafe(text, params);
  return rows as unknown as T[];
}

/**
 * INSERT ... ON CONFLICT DO UPDATE em lotes.
 * Os nomes de tabela/colunas vêm sempre do código, nunca de entrada do usuário.
 */
export async function upsert(table: string, rows: Record<string, any>[], conflict: string[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const updates = cols.filter((c) => !conflict.includes(c));
  const q = (c: string) => `"${c}"`;
  const chunk = Math.max(1, Math.floor(20000 / cols.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const values: any[] = [];
    const tuples = part.map((r, ri) =>
      `(${cols.map((c, ci) => { values.push(r[c] ?? null); return `$${ri * cols.length + ci + 1}`; }).join(",")})`,
    );
    const set = updates.length ? `do update set ${updates.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")}` : "do nothing";
    await db().unsafe(
      `insert into ${q(table)} (${cols.map(q).join(",")}) values ${tuples.join(",")} on conflict (${conflict.map(q).join(",")}) ${set}`,
      values,
    );
  }
}
