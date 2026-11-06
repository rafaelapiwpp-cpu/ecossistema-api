// Registro de mudanças (tabela hub_changes, preenchida por gatilhos em messages/conversations/contatos/etiquetas).
// As telas ficam esperando em /api/pulse; quando algo muda no que o usuário vê, a resposta volta na hora.
import { query } from "./db";
import type { Scope } from "./access";

export type ChangeRow = { id: string; conversation_id: number | null; kind: string; settled: boolean };

/** Uma linha "assenta" 2 s depois de gravada: daí em diante o cursor pode passar por ela sem risco de pular uma gravação ainda em curso. */
const SETTLE = "interval '2 seconds'";

/** Mudanças depois do cursor, só das contas/números que o usuário vê. */
export async function changesAfter(scope: Scope, cursor: number, limit = 400) {
  const args: any[] = [cursor];
  const where = ["id > $1"];
  if (scope.phones) { args.push(scope.phones); where.push(`phone_number_id = any($${args.length}::text[])`); }
  else if (!scope.all) { args.push(scope.wabas); where.push(`waba_id = any($${args.length}::text[])`); }
  args.push(limit);
  return query<ChangeRow>(
    `select id::text, conversation_id, kind, at < clock_timestamp() - ${SETTLE} as settled
     from hub_changes where ${where.join(" and ")} order by id limit $${args.length}`,
    args,
  );
}

/** Id da mudança mais nova já assentada (ponto de partida seguro). */
export async function newestSettled() {
  const [r] = await query<{ id: string }>(`select id::text from hub_changes where at < clock_timestamp() - ${SETTLE} order by at desc limit 1`);
  return Number(r?.id || 0);
}

export async function oldestChange() {
  const [r] = await query<{ id: string | null }>("select min(id)::text as id from hub_changes");
  return Number(r?.id || 0);
}

/** Mais antiga e mais nova já assentada, numa ida só ao banco. */
export async function logBounds() {
  const [r] = await query<{ oldest: string | null; newest: string | null }>(
    `select (select min(id) from hub_changes)::text as oldest,
            (select id from hub_changes where at < clock_timestamp() - ${SETTLE} order by at desc limit 1)::text as newest`,
  );
  return { oldest: Number(r?.oldest || 0), newest: Number(r?.newest || 0) };
}

/** O registro só serve para o tempo real: guarda 2 dias. */
export async function pruneChanges(days = 2) {
  await query("delete from hub_changes where at < now() - make_interval(days => $1::int)", [days]);
}
