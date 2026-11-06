// Gatilhos do bloco Início: "Mensagem recebida" inicia o fluxo sozinho quando o contato escreve.
// Enquanto o robô conversa, a conversa fica na fila do robô ("disparo") e só vai para Aguardando no bloco
// "Atendimento humano" (transferir) — ou quando o cliente escreve depois que o fluxo terminou.
// Se um atendente responder (pelo HUB ou pelo celular), o robô para.
import { query } from "./db";
import { sameMobileIds, type Contact, type Conversation } from "./chat";
import { advance } from "./flows";
import { matchTrigger, type Flow, type FlowRun, type MsgTrigger } from "./flow-shared";
import type { Settings } from "./settings";

const ACTIVE = "('queued', 'running', 'waiting_reply', 'waiting_time')";
const TEAM_MS = 24 * 3600 * 1000;
const TRIGGERS = `'$.nodes[*] ? (@.type == "start").data.triggers[*] ? (@.type == "message")'`;
const NO_TRIGGER = new Set(["reaction", "system", "unsupported", "unknown", "request_welcome"]);

/** A conversa já está com a equipe: em Aguardando/Andamento e com mensagem nas últimas 24 h. */
function withTeam(prev: Pick<Conversation, "status" | "last_message_at">) {
  if (prev.status !== "open" && prev.status !== "pending") return false;
  const t = prev.last_message_at ? new Date(prev.last_message_at as any).getTime() : 0;
  return Date.now() - t < TEAM_MS;
}

/**
 * Mensagem que nenhuma execução estava esperando: procura um fluxo ativo da conta com gatilho "Mensagem recebida"
 * que bata (número, palavra-chave, condição de sessão) e inicia — um fluxo só por mensagem (palavra-chave ganha de
 * "qualquer mensagem"). `prev` = a conversa como estava antes desta mensagem.
 */
export async function startByMessage(s: Settings, wabaId: string, pnid: string, contact: Contact, prev: Conversation, p: { type: string; body: string | null }): Promise<boolean> {
  if (NO_TRIGGER.has(p.type) || contact.opt_out) return false;
  const flows = await query<Flow & { trig: MsgTrigger[] }>(
    `select f.*, jsonb_path_query_array(f.graph, ${TRIGGERS}) as trig from flows f
      where f.status = 'active' and f.waba_id = $1 and jsonb_path_exists(f.graph, ${TRIGGERS})`,
    [wabaId],
  );
  if (!flows.length) return false;
  // número da própria empresa (ex.: dois números do HUB conversando) nunca aciona robô: evita robô respondendo robô
  if ((await query("select 1 from phone_numbers where phone_digits = $1 limit 1", [contact.phone])).length) return false;
  const text = p.body || "";
  const team = withTeam(prev);
  const cands: { f: Flow; t: MsgTrigger; score: number; keyword: string | null }[] = [];
  for (const f of flows) {
    for (const t of f.trig || []) {
      if (t.phone_number_id && t.phone_number_id !== pnid) continue;
      if (team && t.skip_team !== false) continue;
      const m = matchTrigger(t, text);
      if (m) cands.push({ f, t, ...m });
    }
  }
  if (!cands.length) return false;
  cands.sort((a, b) => b.score - a.score || new Date(b.f.updated_at as any).getTime() - new Date(a.f.updated_at as any).getTime());
  const ids = await sameMobileIds(contact.id);
  // o robô já está atendendo este contato (ex.: numa espera): "qualquer mensagem" não interrompe; palavra-chave de
  // outra automação assume (a anterior é encerrada) — nunca dois robôs ao mesmo tempo na mesma conversa
  const [busy] = await query<{ flow_id: number }>(
    `select flow_id from flow_runs where contact_id = any($1::int[]) and phone_number_id = $2 and not is_test and status in ${ACTIVE}
        and vars->>'trigger' = 'message' and coalesce(vars->>'handoff', '') = '' limit 1`,
    [ids, pnid],
  );
  for (const c of cands) {
    if (busy && !c.keyword) continue;
    const run = await claim(c.f, c.t, contact, ids, pnid, prev.id, text, c.keyword, p.type);
    if (!run) continue;
    if (busy) {
      await query(
        `update flow_runs set status = 'cancelled', last_error = 'Substituído por outra automação (palavra-chave)', finished_at = now(), updated_at = now(),
           wait_node_id = null, wait_until = null, next_at = null
         where contact_id = any($1::int[]) and phone_number_id = $2 and not is_test and status in ${ACTIVE} and vars->>'trigger' = 'message' and flow_id <> $3`,
        [ids, pnid, c.f.id],
      );
    }
    await query("update conversations set status = 'disparo' where id = $1 and status = 'open'", [prev.id]); // fila do robô até transferir
    try { await advance(s, c.f, run, null); } catch (e) { console.error("flow trigger", e); }
    return true;
  }
  return false;
}

/** Confere a condição de sessão do gatilho e cria a execução (ou devolve null se não deve iniciar). */
async function claim(f: Flow, t: MsgTrigger, contact: Contact, ids: number[], pnid: string, convId: number, text: string, keyword: string | null, type: string) {
  const session = t.session || "daily";
  const [ex] = await query<{ active: boolean | null; recent: boolean | null; had: boolean; burst: boolean | null }>(
    `select bool_or(status in ${ACTIVE}) as active, bool_or(created_at > now() - interval '24 hours') as recent, count(*) > 0 as had,
            bool_or(created_at > now() - interval '30 seconds' and vars->>'trigger' = 'message') as burst
       from flow_runs where flow_id = $1 and contact_id = any($2::int[]) and not is_test`,
    [f.id, ids],
  );
  if (session === "once" && ex?.had) return null;
  if (session === "daily" && ex?.recent) return null;
  if (session === "not_in_flow" && ex?.active) return null;
  if (session === "always") {
    if (ex?.burst) return null; // mensagens seguidas (menos de 30 s) contam como uma só
    if (ex?.active) {
      await query(
        `update flow_runs set status = 'cancelled', last_error = 'Reiniciado por uma nova mensagem (gatilho)', finished_at = now(), updated_at = now(),
           wait_node_id = null, wait_until = null, next_at = null
         where flow_id = $1 and contact_id = any($2::int[]) and not is_test and status in ${ACTIVE}`,
        [f.id, ids],
      );
    }
  }
  const vars: Record<string, any> = { trigger: "message", trigger_id: t.id, mensagem: text, last_reply: text, last_reply_type: type };
  if (keyword) vars.palavra = keyword;
  const [run] = await query<FlowRun>(
    `insert into flow_runs (flow_id, contact_id, phone, conversation_id, phone_number_id, status, vars, is_test, started_at)
     values ($1, $2, $3, $4, $5, 'running', $6, false, now()) on conflict do nothing returning *`,
    [f.id, contact.id, contact.phone, convId, pnid, vars],
  );
  if (!run) return null; // outra mensagem do mesmo contato iniciou no mesmo instante
  const start = f.graph.nodes.find((n) => n.type === "start");
  if (start) await query("insert into flow_events (flow_id, run_id, node_id, type, data) values ($1, $2, $3, 'trigger', $4)", [f.id, run.id, start.id, { trigger_id: t.id, text: text.slice(0, 300), keyword }]);
  return run;
}

/** O cliente escreveu enquanto o robô ainda está no fluxo (ex.: numa espera): a conversa continua na fila do robô. */
export async function keepWithRobot(contactId: number, pnid: string, convId: number) {
  const ids = await sameMobileIds(contactId);
  await query(
    `update conversations set status = 'disparo' where id = $1 and status = 'open'
       and exists (select 1 from flow_runs r where r.contact_id = any($2::int[]) and r.phone_number_id = $3 and not r.is_test and r.status in ${ACTIVE}
                   and r.vars->>'trigger' = 'message' and coalesce(r.vars->>'handoff', '') = '')`,
    [convId, ids, pnid],
  );
}

/** Um atendente respondeu (HUB ou celular): o robô iniciado por mensagem para nesta conversa. */
export async function stopBot(contactId: number, pnid: string, reason: string) {
  await query(
    `update flow_runs set status = 'stopped', last_error = $3, finished_at = now(), updated_at = now(), wait_node_id = null, wait_until = null, next_at = null
     where contact_id = $1 and phone_number_id = $2 and not is_test and status in ${ACTIVE} and vars->>'trigger' = 'message'`,
    [contactId, pnid, reason],
  );
}
