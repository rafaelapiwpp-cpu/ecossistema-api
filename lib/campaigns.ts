// Disparos (campanhas): público, variáveis do template, motor de envio em lotes e acompanhamento.
import { query } from "./db";
import { findOrCreateContact, findOrCreateConversation, sendTemplate, renderTemplatePreview, type Contact } from "./chat";
import { MetaError, onlyDigits } from "./meta";
import type { Settings } from "./settings";
import { buildComponents, placeholdersOf, type Mapping, type Placeholders } from "./template-vars";

export type Audience = {
  scope: "lists" | "tags" | "all" | "phones";
  list_ids?: number[]; tag_ids?: number[]; department_id?: number | null;
  waba_only?: boolean; other_accounts?: boolean; exclude_tag_ids?: number[]; exclude_recent_days?: number; exclude_campaign_ids?: number[];
  only_replied?: boolean; phones?: string[];
};
export type Campaign = {
  id: number; name: string; waba_id: string; phone_number_id: string; template_id: string; template_name: string; template_language: string;
  template_category: string | null; mapping: Mapping; audience: Audience; status: "draft" | "scheduled" | "running" | "paused" | "done" | "cancelled";
  scheduled_at: string | null; rate_per_minute: number; total: number; last_error: string | null; lock_until: string | null;
  created_by: number | null; created_at: string; started_at: string | null; finished_at: string | null; updated_at: string;
};

export const CAMPAIGN_STATUS: Record<string, string> = {
  draft: "Rascunho", scheduled: "Agendado", running: "Enviando", paused: "Pausado", done: "Concluído", cancelled: "Cancelado",
};
export const RECIPIENT_STATUS: Record<string, string> = {
  pending: "Na fila", sending: "Enviando", sent: "Enviado", delivered: "Entregue", read: "Lido", failed: "Falhou", skipped: "Pulado",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export { placeholdersOf, buildComponents, previewFor, resolveSource } from "./template-vars";
export type { ParamSource, Mapping, Placeholders } from "./template-vars";

/** Opções de origem de uma variável, com os campos personalizados existentes nos contatos. */
export async function fieldOptions() {
  const rows = await query<{ key: string }>("select distinct jsonb_object_keys(fields) as key from contacts where fields <> '{}'::jsonb order by 1 limit 50");
  return [
    { value: "name", label: "Nome do contato" }, { value: "first_name", label: "Primeiro nome" },
    { value: "phone", label: "Telefone" }, { value: "email", label: "E-mail" },
    ...rows.map((r) => ({ value: `fields.${r.key}`, label: `Campo: ${r.key}` })),
  ];
}

// ---------- público ----------

export function normalizePhone(raw: string) {
  let p = onlyDigits(raw);
  if (p.length === 10 || p.length === 11) p = "55" + p; // DDD + número, sem DDI
  return p.length >= 10 && p.length <= 15 ? p : "";
}

/** SQL (com parâmetros) que seleciona o público de uma campanha, um telefone por linha. */
/**
 * Contas do mesmo "lado" da conta informada: BMs de Equipe só enxergam contatos de BMs de Equipe e
 * as BMs só do Master só enxergam os delas (o público de um disparo/fluxo nunca mistura os dois).
 */
export const sameSideWabas = (param: string) =>
  `select w2.id from wabas w2 left join connections c2 on c2.id = w2.connection_id
    where coalesce(c2.visibility, 'private') = (select coalesce(c3.visibility, 'private') from wabas w3 left join connections c3 on c3.id = w3.connection_id where w3.id = ${param})`;

export function audienceSql(a: Audience, wabaId: string) {
  const params: any[] = [wabaId];
  const p = (v: any) => { params.push(v); return `$${params.length}`; };
  // só os contatos desta conta (cliente); outras contas da agência apenas se pedido explicitamente
  const where: string[] = ["c.opt_out = false", a.other_accounts ? `c.waba_id in (${sameSideWabas("$1")})` : "c.waba_id = $1"];
  if (a.scope === "lists") where.push(`exists (select 1 from list_contacts lc where lc.contact_id = c.id and lc.list_id = any(${p((a.list_ids || []).map(Number))}::int[]))`);
  if (a.scope === "tags") where.push(`exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = any(${p((a.tag_ids || []).map(Number))}::int[]))`);
  if (a.department_id) where.push(`c.department_id = ${p(Number(a.department_id))}`);
  if (a.exclude_tag_ids?.length) where.push(`not exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = any(${p(a.exclude_tag_ids.map(Number))}::int[]))`);
  if (a.exclude_recent_days) where.push(`(c.last_outbound_at is null or c.last_outbound_at < now() - (${p(String(Number(a.exclude_recent_days)))} || ' days')::interval)`);
  if (a.exclude_campaign_ids?.length) where.push(`not exists (select 1 from campaign_recipients r where r.phone = c.phone and r.campaign_id = any(${p(a.exclude_campaign_ids.map(Number))}::int[]))`);
  if (a.only_replied) where.push("c.last_inbound_at is not null");
  const sql = `select distinct on (c.phone) c.id as contact_id, c.phone, c.name from contacts c where ${where.join(" and ")} order by c.phone, (c.waba_id = $1) desc, c.id`;
  return { sql, params };
}

export async function audiencePreview(a: Audience, wabaId: string) {
  if (a.scope === "phones") {
    const phones = [...new Set((a.phones || []).map(normalizePhone).filter(Boolean))];
    const rows = await query<{ phone: string; name: string | null }>(
      `select p.phone, k.name from unnest($1::text[]) as p(phone)
       left join lateral (select name, opt_out from contacts where phone = p.phone and waba_id in (${sameSideWabas("$2")}) order by (waba_id = $2) desc, id limit 1) k on true
       where coalesce(k.opt_out, false) = false`, [phones, wabaId]);
    return { total: rows.length, sample: rows.slice(0, 8) };
  }
  const { sql, params } = audienceSql(a, wabaId);
  const [{ n }] = await query<{ n: number }>(`select count(*)::int as n from (${sql}) x`, params);
  const sample = await query<{ phone: string; name: string | null }>(`select phone, name from (${sql}) x limit 8`, params);
  return { total: n, sample };
}

/** Preenche a fila de destinatários da campanha a partir do público. Devolve o total. */
export async function fillRecipients(c: Campaign) {
  const a = c.audience;
  if (a.scope === "phones") {
    const phones = [...new Set((a.phones || []).map(normalizePhone).filter(Boolean))];
    for (let i = 0; i < phones.length; i += 500) {
      const chunk = phones.slice(i, i + 500);
      await query(
        `insert into campaign_recipients (campaign_id, contact_id, phone, name)
         select $1, k.id, p.phone, k.name from unnest($2::text[]) as p(phone)
         left join lateral (select id, name, opt_out from contacts where phone = p.phone and waba_id in (${sameSideWabas("$3")}) order by (waba_id = $3) desc, id limit 1) k on true
         where coalesce(k.opt_out, false) = false
         on conflict (campaign_id, phone) do nothing`,
        [c.id, chunk, c.waba_id],
      );
    }
  } else {
    const { sql, params } = audienceSql(a, c.waba_id);
    const n = params.length + 1;
    await query(`insert into campaign_recipients (campaign_id, contact_id, phone, name) select $${n}::int, contact_id, phone, name from (${sql}) x on conflict (campaign_id, phone) do nothing`, [...params, c.id]);
  }
  const [{ n }] = await query<{ n: number }>("select count(*)::int as n from campaign_recipients where campaign_id = $1", [c.id]);
  await query("update campaigns set total = $2, updated_at = now() where id = $1", [c.id, n]);
  return n;
}

/** Custo médio por mensagem (R$) da categoria na conta, pelos últimos 60 dias de custos. */
export async function unitCost(wabaId: string, category: string | null) {
  const rows = await query<{ unit: number | null; n: number }>(
    `select sum(cost) / nullif(sum(volume), 0) as unit, sum(volume)::int as n from daily_costs
     where day > current_date - 60 and (waba_id = $1 or $1 = '') and lower(pricing_category) = lower($2)`,
    [wabaId, category || "marketing"],
  );
  if (rows[0]?.unit) return Number(rows[0].unit);
  const any = await query<{ unit: number | null }>("select sum(cost) / nullif(sum(volume), 0) as unit from daily_costs where day > current_date - 60 and lower(pricing_category) = lower($1)", [category || "marketing"]);
  return any[0]?.unit ? Number(any[0].unit) : null;
}

// ---------- acompanhamento ----------

export type Counts = { pending: number; sending: number; sent: number; delivered: number; read: number; failed: number; skipped: number; replied: number; billable: number };

export const COUNTS_SQL = `
  (select json_build_object(
     'pending', count(*) filter (where status = 'pending'), 'sending', count(*) filter (where status = 'sending'),
     'sent', count(*) filter (where status = 'sent'), 'delivered', count(*) filter (where status = 'delivered'),
     'read', count(*) filter (where status = 'read'), 'failed', count(*) filter (where status = 'failed'),
     'skipped', count(*) filter (where status = 'skipped'), 'replied', count(*) filter (where replied),
     'billable', count(*) filter (where billable))
   from campaign_recipients r where r.campaign_id = c.id)`;

/** Atualiza o destinatário quando chega o status da mensagem (chamado pelo webhook). */
export async function recipientStatus(wamid: string, status: string, err: { code?: number; title?: string } | null, pricing: { category?: string | null; billable?: boolean | null }) {
  await query(
    `update campaign_recipients set
       status = case when $2 = 'failed' then 'failed'
                     when status in ('failed', 'skipped') then status
                     when $2 = 'read' then 'read'
                     when $2 = 'delivered' and status <> 'read' then 'delivered'
                     when $2 = 'sent' and status in ('pending', 'sending', 'sent') then 'sent'
                     else status end,
       error_code = coalesce($3, error_code), error_title = coalesce($4, error_title),
       pricing_category = coalesce($5, pricing_category), billable = coalesce($6, billable), updated_at = now()
     where wamid = $1`,
    [wamid, status, err?.code ?? null, err?.title ?? null, pricing.category ?? null, pricing.billable ?? null],
  );
}

/** Marca como "respondeu" o último disparo recente para este telefone (chamado quando chega mensagem do cliente). */
export async function recipientReplied(phone: string) {
  await query(
    `update campaign_recipients set replied = true, updated_at = now()
     where id in (select id from campaign_recipients where phone = $1 and replied = false and sent_at > now() - interval '7 days' and status in ('sent','delivered','read') order by sent_at desc limit 1)`,
    [phone],
  );
}

// ---------- motor de envio ----------

const RETRYABLE = new Set([130429, 131056, 80007, 131048, 4, 2]); // limites de taxa / indisponibilidade momentânea

/** Processa a fila de uma campanha por até `budgetMs`. Devolve quantos ficaram pendentes. */
export async function runCampaign(s: Settings, id: number, budgetMs = 40000) {
  const started = Date.now();
  const [c] = await query<Campaign>(
    `update campaigns set lock_until = now() + interval '3 minutes', updated_at = now()
     where id = $1 and status in ('running', 'scheduled') and (lock_until is null or lock_until < now())
       and (scheduled_at is null or scheduled_at <= now() or status = 'running') returning *`,
    [id],
  );
  if (!c) return { ran: false, remaining: null as number | null };
  if (c.status === "scheduled") await query("update campaigns set status = 'running', started_at = coalesce(started_at, now()) where id = $1", [id]);
  else if (!c.started_at) await query("update campaigns set started_at = now() where id = $1", [id]);

  // envios que ficaram presos (função interrompida no meio) voltam para a fila
  await query("update campaign_recipients set status = 'pending' where campaign_id = $1 and status = 'sending' and updated_at < now() - interval '5 minutes'", [id]);

  const [tpl] = await query<{ components: any[] | null }>("select components from templates where id = $1", [c.template_id]);
  const ph = placeholdersOf(tpl?.components);
  const interval = 60000 / Math.max(1, Math.min(c.rate_per_minute || 120, 1200));
  const workers = Math.max(1, Math.min(6, Math.ceil((c.rate_per_minute || 120) / 60)));
  let processed = 0;
  let next = Date.now();
  let stop = false;

  const one = async (r: { id: number; contact_id: number | null; phone: string; name: string | null; attempts: number }) => {
    try {
      let contact: Contact | undefined;
      if (r.contact_id) [contact] = await query<Contact>("select * from contacts where id = $1", [r.contact_id]);
      if (!contact || contact.waba_id !== c.waba_id) contact = await findOrCreateContact(c.waba_id, r.phone, contact?.name || r.name, "disparo");
      if (contact.opt_out) {
        await query("update campaign_recipients set status = 'skipped', error_title = 'Contato pediu para não receber (opt-out)', contact_id = $2, updated_at = now() where id = $1", [r.id, contact.id]);
        return;
      }
      const built = buildComponents(ph, c.mapping, contact);
      if (built.missing.length) {
        await query("update campaign_recipients set status = 'skipped', error_title = $2, contact_id = $3, updated_at = now() where id = $1", [r.id, `Variável sem valor: ${built.missing.join(", ")}`, contact.id]);
        return;
      }
      const conv = await findOrCreateConversation(c.waba_id, c.phone_number_id, contact.id, "disparo");
      const preview = renderTemplatePreview(tpl?.components, ph.body.map((k) => built.values[k] ?? ""));
      const msg = await sendTemplate(s, {
        phoneNumberId: c.phone_number_id, to: contact.phone, conversationId: conv.id, contactId: contact.id, wabaId: c.waba_id, userId: c.created_by,
        campaignId: c.id, template: { name: c.template_name, language: c.template_language, components: built.components, preview: ph.body.length ? preview : undefined },
      });
      await query(
        "update campaign_recipients set status = 'sent', wamid = $2, sent_at = now(), conversation_id = $3, contact_id = $4, params = $5, updated_at = now() where id = $1",
        [r.id, msg.wamid, conv.id, contact.id, built.values],
      );
    } catch (e: any) {
      const code = e instanceof MetaError ? e.code : undefined;
      if (code && RETRYABLE.has(code) && r.attempts < 3) {
        await query("update campaign_recipients set status = 'pending', attempts = attempts + 1, error_code = $2, error_title = $3, updated_at = now() where id = $1", [r.id, code, e.message]);
        await sleep(3000);
        return;
      }
      await query("update campaign_recipients set status = 'failed', error_code = $2, error_title = $3, updated_at = now() where id = $1", [r.id, code ?? null, String(e.message || e).slice(0, 500)]);
      if (code === 190 || code === 10 || code === 200) { // token inválido / sem permissão: não adianta continuar
        await query("update campaigns set status = 'paused', last_error = $2, updated_at = now() where id = $1", [id, `Pausado automaticamente: ${e.message}`]);
        stop = true;
      }
    }
  };

  const stillRunning = async () => (await query<{ status: string }>("select status from campaigns where id = $1", [id]))[0]?.status === "running";
  const release = (ids: number[]) => (ids.length ? query("update campaign_recipients set status = 'pending', updated_at = now() where id = any($1::bigint[]) and status = 'sending'", [ids]) : Promise.resolve([]));
  const batchSize = Math.min(50, Math.max(workers * 2, Math.ceil((c.rate_per_minute || 120) / 6))); // ~10 s de envios por lote

  while (!stop && Date.now() - started < budgetMs) {
    if (!(await stillRunning())) break;
    const batch = await query<any>(
      `update campaign_recipients set status = 'sending', updated_at = now()
       where id in (select id from campaign_recipients where campaign_id = $1 and status = 'pending' order by id limit $2) returning id, contact_id, phone, name, attempts`,
      [id, batchSize],
    );
    if (!batch.length) break;
    const inflight = new Set<Promise<void>>();
    for (let i = 0; i < batch.length; i++) {
      const r = batch[i];
      if (!stop && i > 0 && i % 3 === 0 && !(await stillRunning())) stop = true; // pausa/cancelamento valem em segundos
      if (!stop && Date.now() - started > budgetMs + 10000) stop = true;
      if (stop) { await release(batch.slice(i).map((x: any) => x.id)); break; }
      const wait = next - Date.now();
      if (wait > 0) await sleep(wait);
      next = Math.max(next, Date.now()) + interval;
      while (inflight.size >= workers) await Promise.race(inflight);
      const p: Promise<void> = one(r).then(() => { inflight.delete(p); processed++; });
      inflight.add(p);
    }
    await Promise.all(inflight);
    await query("update campaigns set lock_until = now() + interval '3 minutes', updated_at = now() where id = $1", [id]);
  }

  const [{ remaining }] = await query<{ remaining: number }>("select count(*)::int as remaining from campaign_recipients where campaign_id = $1 and status in ('pending', 'sending')", [id]);
  if (remaining === 0) await query("update campaigns set status = 'done', finished_at = now(), lock_until = null, updated_at = now() where id = $1 and status = 'running'", [id]);
  await query("update campaigns set lock_until = null, updated_at = now() where id = $1", [id]);
  return { ran: true, processed, remaining };
}

/** Campanhas com trabalho pendente que ninguém está processando. */
export async function dueCampaigns() {
  return query<{ id: number }>(
    `select c.id from campaigns c where c.status in ('running', 'scheduled') and (c.lock_until is null or c.lock_until < now())
       and (c.scheduled_at is null or c.scheduled_at <= now() or c.status = 'running')
       and exists (select 1 from campaign_recipients r where r.campaign_id = c.id and r.status in ('pending', 'sending')) order by c.id`,
  );
}

/**
 * Chama o processamento de uma campanha via HTTP. No encadeamento de lotes (waitMs alto) a função atual espera a
 * resposta do próximo lote, que chega antes do lote seguinte começar; nos "empurrões" basta iniciar a chamada.
 */
export function triggerRun(s: Settings, baseUrl: string, id: number, waitMs = 5000) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/campanhas/${id}/run`;
  return fetch(url, { method: "POST", headers: { authorization: `Bearer ${s.cron_secret}` }, signal: AbortSignal.timeout(waitMs), cache: "no-store" })
    .then(() => true).catch(() => false);
}

/** Dispara todas as campanhas devidas. Usado pelo webhook, pelo cron e pelas telas. */
export async function kickCampaigns(s: Settings, baseUrl: string) {
  const due = await dueCampaigns();
  await Promise.all(due.map((d) => triggerRun(s, baseUrl, d.id)));
  return due.length;
}

/** URL pública do próprio painel (para o motor chamar a si mesmo). */
export function selfUrl(req: Request) {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return new URL(req.url).origin;
}
