// Núcleo do atendimento: contatos, conversas, mensagens recebidas (webhook) e enviadas.
import { query, upsert } from "./db";
import { onlyDigits, type Graph } from "./meta";
import { graphForPhone, graphOf, listConnections } from "./connections";
import { keywordList, type Settings } from "./settings";
import { recipientReplied, recipientStatus } from "./campaigns";
import { onFlowInbound, stopRunsForContact } from "./flows";
import { keepWithRobot, startByMessage, stopBot } from "./flow-triggers";

export type Contact = {
  id: number; waba_id: string; phone: string; name: string | null; email: string | null; fields: Record<string, any>;
  department_id: number | null; opt_out: boolean; opt_out_at: string | null; source: string | null; notes: string | null;
  last_inbound_at: string | null; last_outbound_at: string | null; created_at: string; updated_at: string;
};
export type Conversation = {
  id: number; waba_id: string; phone_number_id: string; contact_id: number; status: "open" | "pending" | "closed" | "disparo";
  assigned_user_id: number | null; department_id: number | null; origin: string | null;
  last_message_at: string | null; last_inbound_at: string | null; last_outbound_at: string | null; last_preview: string | null;
  unread_count: number; window_expires_at: string | null; closed_at: string | null; created_at: string;
};
export type Message = {
  id: number; conversation_id: number; waba_id: string | null; phone_number_id: string | null; contact_id: number | null;
  wamid: string | null; direction: "in" | "out"; type: string; body: string | null;
  media_id: string | null; media_mime: string | null; media_filename: string | null; payload: any;
  status: string | null; error_code: number | null; error_title: string | null; pricing_category: string | null; billable: boolean | null;
  sent_by_user_id: number | null; template_name: string | null; campaign_id: number | null; ts: string; created_at: string;
};

const WINDOW_MS = 24 * 3600 * 1000;
const iso = (d: Date) => d.toISOString();

export const TYPE_LABEL: Record<string, string> = {
  text: "Texto", image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento", sticker: "Figurinha",
  location: "Localização", contacts: "Contato", interactive: "Resposta", button: "Botão", reaction: "Reação",
  template: "Template", external: "Outra ferramenta", order: "Pedido", system: "Sistema", unsupported: "Não suportado",
};

/** Texto curto que resume uma mensagem (lista de conversas e notificações). */
export function previewOf(type: string, body: string | null, filename?: string | null) {
  if (type === "text" && body) return body;
  const icon: Record<string, string> = { image: "📷 Imagem", video: "🎬 Vídeo", audio: "🎤 Áudio", document: `📎 ${filename || "Documento"}`, sticker: "🙂 Figurinha", location: "📍 Localização", contacts: "👤 Contato", reaction: `Reagiu ${body || ""}`, template: `📨 ${body || "Template"}`, external: body || "Mensagem de outra ferramenta", order: "🛒 Pedido", unsupported: "Mensagem não suportada" };
  if (body && (type === "interactive" || type === "button")) return body;
  return icon[type] || body || type;
}

// ---------- contatos e conversas ----------

/**
 * Celular brasileiro com e sem o 9. Contas de WhatsApp antigas usam o número sem o 9 (ex.: 55 51 8640-8283), mesmo
 * que a pessoa digite 55 51 98640-8283 — a Meta entrega nos dois, mas a resposta volta pelo número oficial (wa_id).
 */
export function brPhoneAlt(phone: string): string | null {
  const p = onlyDigits(phone);
  if (!p.startsWith("55")) return null;
  if (p.length === 13 && p[4] === "9") return p.slice(0, 4) + p.slice(5);
  if (p.length === 12 && /[6-9]/.test(p[4])) return p.slice(0, 4) + "9" + p.slice(4);
  return null;
}

/** Números que vêm da própria Meta (o wa_id oficial): mensagem recebida, eco do celular e recibo de outra ferramenta. */
const OFFICIAL_SOURCES = new Set(["whatsapp", "celular", "externo"]);
/** Contato cujo número com certeza é o WhatsApp oficial: já mandou mensagem ou foi criado pela própria Meta. */
export const isOfficialContact = (c: Contact) => !!c.last_inbound_at || OFFICIAL_SOURCES.has(String(c.source || ""));

/** Contatos da mesma pessoa (mesmo celular com e sem o 9) na mesma conta — o próprio contato vem primeiro. */
export async function sameMobileIds(contactId: number): Promise<number[]> {
  const [c] = await query<{ waba_id: string; phone: string }>("select waba_id, phone from contacts where id = $1", [contactId]);
  const alt = c ? brPhoneAlt(c.phone) : null;
  if (!c || !alt) return [contactId];
  const rows = await query<{ id: number }>("select id from contacts where waba_id = $1 and phone = $2", [c.waba_id, alt]);
  return [contactId, ...rows.map((r) => r.id)];
}

export async function findOrCreateContact(wabaId: string, phoneRaw: string, name?: string | null, source = "whatsapp"): Promise<Contact> {
  const phone = onlyDigits(phoneRaw);
  // o mesmo celular já salvo no outro formato (com/sem o 9): usa esse contato em vez de criar outro;
  // se o número veio da Meta, o contato passa a usar o oficial (o outro formato não existe, então não há conflito)
  const alt = brPhoneAlt(phone);
  if (alt) {
    const both = await query<Contact>("select * from contacts where waba_id = $1 and phone in ($2, $3)", [wabaId, phone, alt]);
    const exact = both.find((c) => c.phone === phone), other = both.find((c) => c.phone === alt);
    // os dois já existem (cadastros antigos): quem digitou o número usa o que é o WhatsApp de verdade
    // (já mandou mensagem ou veio da Meta) — assim o envio cai na conversa do lead
    if (exact && other && !OFFICIAL_SOURCES.has(source) && isOfficialContact(other) && !isOfficialContact(exact)) return other;
    if (!exact) {
      if (other) {
        const [c] = await query<Contact>(
          `update contacts set phone = case when $3 then $2 else phone end, name = coalesce(name, $4), updated_at = now() where id = $1 returning *`,
          [other.id, phone, OFFICIAL_SOURCES.has(source), name || null],
        ).catch(() => [] as Contact[]); // corrida rara com outro webhook: segue o caminho normal abaixo
        if (c) return c;
      }
    }
  }
  const rows = await query<Contact>(
    `insert into contacts (waba_id, phone, name, source) values ($1, $2, $3, $4)
     on conflict (waba_id, phone) do update set
       name = coalesce(contacts.name, excluded.name), updated_at = now()
     returning *`,
    [wabaId, phone, name || null, source],
  );
  return rows[0];
}

export async function findOrCreateConversation(wabaId: string, phoneNumberId: string, contactId: number, origin: string): Promise<Conversation> {
  const rows = await query<Conversation & { company_id?: number | null; inserted?: boolean }>(
    `insert into conversations (waba_id, phone_number_id, contact_id, origin, status) values ($1, $2, $3, $4, case when $4 in ('disparo', 'fluxo') then 'disparo' else 'open' end)
     on conflict (phone_number_id, contact_id) do update set waba_id = excluded.waba_id
     returning *, (xmax = 0) as inserted`,
    [wabaId, phoneNumberId, contactId, origin],
  );
  const conv = rows[0];
  const inserted = !!conv.inserted;
  delete conv.inserted;
  try { await stampCompany(conv, contactId, inserted); } catch (e) { console.error("stampCompany", e); } // portal: nunca derruba o atendimento
  if (inserted && conv.department_id == null) {
    // a empresa pode ter departamento padrão: a conversa nasce já nele (o stamp acima gravou)
    const [fresh] = await query<{ department_id: number | null }>("select department_id from conversations where id = $1", [conv.id]);
    if (fresh) conv.department_id = fresh.department_id;
  }
  return conv;
}

// ---------- portal de clientes: empresa dona do número → conversa, contato e funil ----------

/** Empresa que atende este número (company_phones), se houver. */
export async function companyOfPhone(phoneNumberId: string): Promise<number | null> {
  const [r] = await query<{ company_id: number }>("select company_id from company_phones where phone_number_id = $1 limit 1", [phoneNumberId]);
  return r?.company_id ?? null;
}

/**
 * Grava a empresa na conversa e no contato (quando ainda não têm), coloca o contato no funil padrão da empresa
 * e, numa conversa nova, aplica as automações dela (departamento padrão e etiquetas automáticas).
 */
async function stampCompany(conv: { id: number; phone_number_id: string; company_id?: number | null }, contactId: number, isNew = false) {
  const companyId = await companyOfPhone(conv.phone_number_id);
  if (!companyId) return;
  if (conv.company_id !== companyId) await query("update conversations set company_id = $2 where id = $1", [conv.id, companyId]);
  const touched = await query<{ id: number }>("update contacts set company_id = $2 where id = $1 and company_id is null returning id", [contactId, companyId]);
  await addToDefaultPipeline(companyId, contactId);
  if (isNew || touched.length) await applyCompanyDefaults(companyId, contactId, isNew ? conv.id : null);
}

/**
 * Automações da empresa: departamento padrão (na conversa nova e no contato sem departamento) e etiquetas automáticas no contato.
 * Usada no webhook (conversa nova), no "Novo lead" do funil e na importação de contatos do portal.
 */
export async function applyCompanyDefaults(companyId: number, contactId: number, conversationId: number | null) {
  const [c] = await query<{ default_department_id: number | null }>("select default_department_id from companies where id = $1", [companyId]);
  const dep = c?.default_department_id ?? null;
  if (dep) {
    const [ok] = await query("select 1 from departments where id = $1 and company_id = $2", [dep, companyId]);
    if (ok) {
      if (conversationId) await query("update conversations set department_id = $2 where id = $1 and department_id is null", [conversationId, dep]);
      await query("update contacts set department_id = $2 where id = $1 and department_id is null", [contactId, dep]);
    }
  }
  await query(
    `insert into contact_tags (contact_id, tag_id)
     select $1, t.tag_id from company_auto_tags t join tags g on g.id = t.tag_id and g.company_id = t.company_id where t.company_id = $2
     on conflict do nothing`, [contactId, companyId]);
}

/** Entra na 1ª etapa do primeiro funil com "entrada automática" da empresa — só se o contato ainda não estiver nele. */
export async function addToDefaultPipeline(companyId: number, contactId: number) {
  const [p] = await query<{ id: number; stage_id: number | null }>(
    `select p.id, (select s.id from pipeline_stages s where s.pipeline_id = p.id order by s.position, s.id limit 1) as stage_id
     from pipelines p where p.company_id = $1 and p.auto_add order by p.position, p.id limit 1`, [companyId]);
  if (!p?.stage_id) return;
  await query(
    `insert into pipeline_cards (pipeline_id, contact_id, stage_id, position)
     values ($1, $2, $3, coalesce((select max(position) + 1 from pipeline_cards where stage_id = $3), 0))
     on conflict (pipeline_id, contact_id) do nothing`, [p.id, contactId, p.stage_id]);
}

async function logEvent(conversationId: number, type: string, userId: number | null, data: any = null) {
  await query("insert into conversation_events (conversation_id, type, user_id, data) values ($1, $2, $3, $4)", [conversationId, type, userId, data ?? null]);
}

// ---------- webhook: mensagens recebidas ----------

type Parsed = { type: string; body: string | null; media_id: string | null; media_mime: string | null; media_filename: string | null };

export function parseInbound(m: any): Parsed {
  const t = m.type as string;
  const none = { media_id: null, media_mime: null, media_filename: null };
  switch (t) {
    case "text": return { type: t, body: m.text?.body ?? "", ...none };
    case "image": case "video": case "audio": case "document": case "sticker": {
      const med = m[t] || {};
      return { type: t, body: med.caption ?? null, media_id: med.id ?? null, media_mime: med.mime_type ?? null, media_filename: med.filename ?? null };
    }
    case "location": {
      const l = m.location || {};
      return { type: t, body: [l.name, l.address, `${l.latitude},${l.longitude}`].filter(Boolean).join(" · "), ...none };
    }
    case "contacts": {
      const names = (m.contacts || []).map((c: any) => c?.name?.formatted_name).filter(Boolean);
      return { type: t, body: names.join(", ") || null, ...none };
    }
    case "interactive": {
      const i = m.interactive || {};
      const body = i.button_reply?.title ?? i.list_reply?.title ?? (i.nfm_reply ? `Formulário enviado` : null);
      return { type: t, body, ...none };
    }
    case "button": return { type: t, body: m.button?.text ?? m.button?.payload ?? null, ...none };
    case "reaction": return { type: t, body: m.reaction?.emoji ?? null, ...none };
    case "order": return { type: t, body: `Pedido com ${(m.order?.product_items || []).length} item(ns)`, ...none };
    case "system": return { type: t, body: m.system?.body ?? null, ...none };
    default: return { type: t || "unsupported", body: m.errors?.[0]?.title ?? null, ...none };
  }
}

export async function handleInboundMessages(s: Settings, wabaId: string, value: any) {
  const pnid = String(value?.metadata?.phone_number_id || "");
  const names = new Map<string, string>();
  for (const c of value?.contacts || []) if (c?.wa_id) names.set(onlyDigits(c.wa_id), c?.profile?.name || "");
  const optout = keywordList(s.optout_keywords);
  const optin = keywordList(s.optin_keywords);

  for (const m of value?.messages || []) {
    const phone = onlyDigits(m.from);
    if (!phone || !m.id) continue;
    const contact = await findOrCreateContact(wabaId, phone, names.get(phone) || null);
    const conv = await findOrCreateConversation(wabaId, pnid, contact.id, m.referral ? "anuncio" : "organica");
    const ts = new Date(Number(m.timestamp) * 1000 || Date.now());
    const p = parseInbound(m);
    const inserted = await query(
      `insert into messages (conversation_id, waba_id, phone_number_id, contact_id, wamid, direction, type, body, media_id, media_mime, media_filename, payload, status, ts)
       values ($1, $2, $3, $4, $5, 'in', $6, $7, $8, $9, $10, $11, 'received', $12)
       on conflict (wamid) do nothing returning id`,
      [conv.id, wabaId, pnid, contact.id, m.id, p.type, p.body, p.media_id, p.media_mime, p.media_filename, m, iso(ts)],
    );
    if (!inserted.length) continue; // duplicado (a Meta reenvia webhooks)

    const preview = previewOf(p.type, p.body, p.media_filename);
    const reopen = conv.status === "closed";
    await query(
      `update conversations set status = 'open', unread_count = unread_count + 1, last_message_at = $2, last_inbound_at = $2,
         window_expires_at = $3, last_preview = $4, closed_at = null where id = $1`,
      [conv.id, iso(ts), iso(new Date(ts.getTime() + WINDOW_MS)), preview.slice(0, 200)],
    );
    await query("update contacts set last_inbound_at = $2, updated_at = now() where id = $1", [contact.id, iso(ts)]);
    if (reopen) await logEvent(conv.id, "reopened", null, { by: "inbound" });
    if (p.type !== "reaction") await recipientReplied(phone);

    // opt-out / opt-in por palavra-chave
    let optedOut = false;
    if (p.type === "text" && p.body) {
      const word = p.body.trim().toUpperCase();
      if (optout.includes(word) && !contact.opt_out) {
        optedOut = true;
        await query("update contacts set opt_out = true, opt_out_at = now(), updated_at = now() where id = $1", [contact.id]);
        await logEvent(conv.id, "opt_out", null, { word });
        await stopRunsForContact(contact.id, "Contato pediu para não receber (opt-out)").catch(() => {});
        if (s.optout_reply?.trim()) {
          try { await sendText(s, { phoneNumberId: pnid, to: phone, body: s.optout_reply.trim(), conversationId: conv.id, contactId: contact.id, wabaId, userId: null }); } catch { /* registrado no log do envio */ }
        }
      } else if (optin.includes(word) && contact.opt_out) {
        await query("update contacts set opt_out = false, opt_out_at = null, updated_at = now() where id = $1", [contact.id]);
        await logEvent(conv.id, "opt_in", null, { word });
      }
    }

    // fluxos: a resposta avança a execução que estava esperando este contato; se nenhuma esperava, um gatilho
    // "Mensagem recebida" pode iniciar um fluxo (o robô atende e a conversa fica na fila do robô até transferir)
    if (!optedOut) {
      try {
        if (!(await onFlowInbound(s, contact.id, pnid, p, m)) && !(await startByMessage(s, wabaId, pnid, contact, conv, p))) await keepWithRobot(contact.id, pnid, conv.id);
      } catch (e) { console.error("flow inbound", e); }
    }
  }
}

// ---------- webhook: mensagens enviadas pelo app WhatsApp Business do celular (número em coexistência) ----------

/**
 * Quando o número também está no app do celular (coexistência), o que a equipe manda pelo app chega como "eco"
 * (campo `smb_message_echoes`): mesma estrutura de uma mensagem recebida, mas `from` = número da empresa e `to` = cliente.
 * Entra na conversa como enviada (balão de saída marcado "Celular"), sem abrir a janela de 24 h (só mensagem do cliente abre).
 */
export async function handleEchoes(wabaId: string, value: any) {
  const pnid = String(value?.metadata?.phone_number_id || "");
  let saved = 0;
  for (const m of value?.message_echoes || []) {
    const phone = onlyDigits(m.to);
    if (!phone || !m.id) continue;
    const contact = await findOrCreateContact(wabaId, phone, null, "celular");
    const conv = await findOrCreateConversation(wabaId, pnid, contact.id, "manual");
    const ts = new Date(Number(m.timestamp) * 1000 || Date.now());
    const p = parseInbound(m);
    // O recibo de envio (status) pode chegar antes do eco: aí o HUB já guardou uma linha "outra ferramenta" sem texto.
    // O eco troca essa linha pelo conteúdo de verdade (mantendo o status entregue/lida); um eco repetido não muda nada.
    const ins = await query(
      `insert into messages (conversation_id, waba_id, phone_number_id, contact_id, wamid, direction, type, body, media_id, media_mime, media_filename, payload, status, ts)
       values ($1, $2, $3, $4, $5, 'out', $6, $7, $8, $9, $10, $11, 'sent', $12)
       on conflict (wamid) do update set type = excluded.type, body = excluded.body, media_id = excluded.media_id, media_mime = excluded.media_mime,
         media_filename = excluded.media_filename, payload = excluded.payload, ts = excluded.ts
       where messages.type = 'external'
       returning id`,
      [conv.id, wabaId, pnid, contact.id, m.id, p.type, p.body, p.media_id, p.media_mime, p.media_filename, { ...m, smb_echo: true }, iso(ts)],
    );
    if (!ins.length) continue; // repetido
    saved++;
    const preview = previewOf(p.type, p.body, p.media_filename);
    // alguém da empresa respondeu pelo celular: a conversa sai de "Aguardando" e deixa de contar como não lida
    // (só se o cliente não escreveu depois), e a prévia só muda se esta for a última mensagem da conversa
    await query(
      `update conversations set last_message_at = greatest(coalesce(last_message_at, $2), $2), last_outbound_at = greatest(coalesce(last_outbound_at, $2), $2),
         last_preview = case when exists (select 1 from messages x where x.conversation_id = conversations.id and x.ts > $2) then last_preview else $3 end,
         status = case when status in ('open', 'disparo') and (last_inbound_at is null or last_inbound_at <= $2) then 'pending' else status end,
         unread_count = case when last_inbound_at is null or last_inbound_at <= $2 then 0 else unread_count end
       where id = $1`,
      [conv.id, iso(ts), preview.slice(0, 200)],
    );
    await query("update contacts set last_outbound_at = greatest(coalesce(last_outbound_at, $2), $2), updated_at = now() where id = $1", [contact.id, iso(ts)]);
    await stopBot(contact.id, pnid, "Atendente respondeu pelo celular: o robô parou").catch(() => {});
  }
  return saved;
}

/**
 * Reprocessa ecos do celular que o HUB recebeu antes de saber tratá-los (ficaram inteiros no webhook_log, campo `smb_message_echoes`).
 * Repetir é seguro: mensagem já gravada não muda e a linha "outra ferramenta" é trocada pelo texto.
 */
export async function replayEchoes(sinceHours = 72) {
  const rows = await query<{ id: number; waba_id: string | null; payload: any }>(
    `select id, waba_id, payload from webhook_log
     where field = 'smb_message_echoes' and payload ? 'message_echoes' and received_at > now() - make_interval(hours => $1::int) order by id`,
    [Math.max(1, Math.min(720, Math.floor(sinceHours) || 72))],
  );
  let messages = 0;
  for (const r of rows) {
    if (!r.waba_id) continue;
    messages += await handleEchoes(r.waba_id, r.payload);
  }
  return { events: rows.length, messages };
}

/** Agenda do celular (campo `smb_app_state_sync`): só completa o nome de contatos que já existem no HUB — não importa a agenda inteira. */
export async function handleStateSync(wabaId: string, value: any) {
  let n = 0;
  for (const it of value?.state_sync || []) {
    if (it?.type !== "contact" || it?.action === "remove") continue;
    const phone = onlyDigits(it.contact?.phone_number || "");
    const name = String(it.contact?.full_name || it.contact?.first_name || "").trim();
    if (!phone || !name) continue;
    const r = await query("update contacts set name = $3, updated_at = now() where waba_id = $1 and phone = $2 and coalesce(name, '') = '' returning id", [wabaId, phone, name.slice(0, 120)]);
    n += r.length;
  }
  return n;
}

// ---------- webhook: status de mensagens enviadas ----------

/** SQL que só "sobe" o status (sent → delivered → read; failed é final) — a Meta pode entregar os webhooks fora de ordem. */
const STATUS_UPGRADE = (cur: string, nw: string) => `case
  when ${nw} = 'failed' then 'failed'
  when ${cur} in ('read', 'failed') then ${cur}
  when ${cur} = 'delivered' and ${nw} in ('sent', 'accepted') then ${cur}
  else ${nw} end`;

export async function handleStatuses(wabaId: string, value: any) {
  const pnid = String(value?.metadata?.phone_number_id || "");
  for (const st of value?.statuses || []) {
    if (!st?.id) continue;
    const ts = new Date(Number(st.timestamp) * 1000 || Date.now());
    const err = (st.errors || [])[0];
    const cat = st.pricing?.category ?? null;
    const updated = await query<{ id: number; conversation_id: number; status: string | null; campaign_id: number | null; flow_run_id: number | null; contact_id: number | null }>(
      `update messages set status = ${STATUS_UPGRADE("messages.status", "$2")}, error_code = coalesce($3, error_code), error_title = coalesce($4, error_title),
         pricing_category = coalesce($5, pricing_category), billable = coalesce($6, billable)
       where wamid = $1 returning id, conversation_id, status, campaign_id, flow_run_id, contact_id`,
      [st.id, st.status, err?.code ?? null, err?.title ?? null, cat, st.pricing?.billable ?? null],
    );
    if (updated.length && updated[0].campaign_id) {
      await recipientStatus(st.id, st.status, err ? { code: err.code, title: err.title } : null, { category: cat, billable: st.pricing?.billable ?? null });
    }
    if (updated.length) {
      // o recibo traz o WhatsApp oficial do cliente: se o contato estava com o outro formato (com/sem o 9), passa a usar o oficial
      const rid = onlyDigits(st.recipient_id || ""), ridAlt = rid ? brPhoneAlt(rid) : null;
      if (ridAlt && updated[0].contact_id) {
        await query(
          `update contacts set phone = $2, updated_at = now() where id = $1 and phone = $3
             and not exists (select 1 from contacts x where x.waba_id = contacts.waba_id and x.phone = $2)`,
          [updated[0].contact_id, rid, ridAlt],
        ).catch((e) => console.error("recipient_id", e));
      }
      // mensagem de fluxo que a Meta não entregou (ex.: pagamento): a execução deixa de "aguardar resposta" e mostra o motivo
      if (st.status === "failed" && updated[0].flow_run_id) {
        const { onFlowMessageFailed } = await import("./flows");
        await onFlowMessageFailed(Number(updated[0].flow_run_id), st.id, err?.code ?? null, err?.title || err?.message || null).catch((e) => console.error("flow failed", e));
      }
    }
    if (updated.length || !st.recipient_id) continue;

    // Mensagem que não saiu pelo HUB (outra ferramenta ligada à mesma conta): registra uma linha "externa"
    const phone = onlyDigits(st.recipient_id);
    const contact = await findOrCreateContact(wabaId, phone, null, "externo");
    const origin = cat === "marketing" ? "disparo" : cat ? "externo" : "externo";
    const conv = await findOrCreateConversation(wabaId, pnid, contact.id, origin);
    const label = cat === "marketing" ? "Disparo de marketing (outra ferramenta)" : cat === "utility" ? "Mensagem de utilidade (outra ferramenta)" : cat === "authentication" ? "Código de autenticação (outra ferramenta)" : "Mensagem enviada por outra ferramenta";
    const ins = await query(
      `insert into messages (conversation_id, waba_id, phone_number_id, contact_id, wamid, direction, type, body, payload, status, error_code, error_title, pricing_category, billable, ts)
       values ($1, $2, $3, $4, $5, 'out', 'external', $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (wamid) do update set status = ${STATUS_UPGRADE("messages.status", "excluded.status")}, error_code = coalesce(excluded.error_code, messages.error_code), error_title = coalesce(excluded.error_title, messages.error_title)
       returning id`,
      [conv.id, wabaId, pnid, contact.id, st.id, label, st, st.status, err?.code ?? null, err?.title ?? null, cat, st.pricing?.billable ?? null, iso(ts)],
    );
    if (ins.length) {
      await query(
        `update conversations set last_message_at = greatest(coalesce(last_message_at, $2), $2), last_outbound_at = greatest(coalesce(last_outbound_at, $2), $2),
           last_preview = case when last_message_at is null or last_message_at <= $2 then $3 else last_preview end,
           status = case when last_inbound_at is not null and last_inbound_at >= $2 then status
                         when $4 then ${AUTO_STATUS}
                         when status in ('open', 'disparo') then 'pending' else status end
         where id = $1`,
        [conv.id, iso(ts), label, cat === "marketing"],
      );
      await query("update contacts set last_outbound_at = greatest(coalesce(last_outbound_at, $2), $2), updated_at = now() where id = $1", [contact.id, iso(ts)]);
    }
  }
}

// ---------- envio ----------

export type SendCtx = { phoneNumberId: string; to: string; conversationId: number; contactId: number; wabaId: string; userId: number | null; campaignId?: number | null; flowRunId?: number | null };

/**
 * A Meta responde o envio com o número oficial do WhatsApp (wa_id). Se for diferente do digitado (ex.: sem o 9),
 * o contato passa a usá-lo — assim a resposta do cliente cai na mesma conversa e o fluxo que espera a resposta segue.
 */
async function adoptWaId(ctx: SendCtx, r: any) {
  const wa = onlyDigits(r?.contacts?.[0]?.wa_id);
  if (!wa || wa === onlyDigits(ctx.to)) return;
  await query(
    `update contacts set phone = $2, updated_at = now() where id = $1
       and not exists (select 1 from contacts x where x.waba_id = contacts.waba_id and x.phone = $2)`,
    [ctx.contactId, wa],
  ).catch((e) => console.error("wa_id", e));
}

/**
 * Situação da conversa depois de uma mensagem automática (disparo, fluxo ou disparo de marketing de outra ferramenta):
 * vai para a fila "Disparo" (robô) e só volta para "Aguardando" quando o cliente responder — exceto se o cliente
 * já estava esperando um atendente (escreveu por último), aí continua em "Aguardando".
 */
const AUTO_STATUS = `(case when status = 'open' and last_inbound_at is not null and (last_outbound_at is null or last_inbound_at > last_outbound_at) then 'open' else 'disparo' end)`;

async function recordOutbound(ctx: SendCtx, wamid: string, type: string, body: string | null, extra: Partial<Message> = {}) {
  const ts = new Date();
  const rows = await query<Message>(
    `insert into messages (conversation_id, waba_id, phone_number_id, contact_id, wamid, direction, type, body, media_id, media_mime, media_filename, payload, status, sent_by_user_id, template_name, campaign_id, flow_run_id, ts)
     values ($1, $2, $3, $4, $5, 'out', $6, $7, $8, $9, $10, $11, 'accepted', $12, $13, $14, $15, $16)
     on conflict (wamid) do update set body = excluded.body returning *`,
    [ctx.conversationId, ctx.wabaId, ctx.phoneNumberId, ctx.contactId, wamid, type, body, extra.media_id ?? null, extra.media_mime ?? null, extra.media_filename ?? null, extra.payload ?? null, ctx.userId, extra.template_name ?? null, ctx.campaignId ?? null, ctx.flowRunId ?? null, iso(ts)],
  );
  const preview = previewOf(type, body, extra.media_filename);
  await query(
    `update conversations set status = case when $4 then ${AUTO_STATUS} when status = 'closed' then 'closed' else 'pending' end, unread_count = 0,
       last_message_at = $2, last_outbound_at = $2, last_preview = $3 where id = $1`,
    [ctx.conversationId, iso(ts), preview.slice(0, 200), !!(ctx.campaignId || ctx.flowRunId)],
  );
  await query("update contacts set last_outbound_at = $2, updated_at = now() where id = $1", [ctx.contactId, iso(ts)]);
  if (ctx.userId != null && !ctx.campaignId && !ctx.flowRunId) await stopBot(ctx.contactId, ctx.phoneNumberId, "Atendente assumiu a conversa: o robô parou").catch(() => {});
  return rows[0];
}

/** Graph com o token da BM dona do número (envio bloqueado se a conexão estiver desligada). */
const sender = (s: Settings, phoneNumberId: string) => graphForPhone(s, phoneNumberId, { send: true });

export async function sendText(s: Settings, ctx: SendCtx & { body: string }) {
  const g = await sender(s, ctx.phoneNumberId);
  const r = await g.json(`${ctx.phoneNumberId}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", to: ctx.to, type: "text", text: { preview_url: true, body: ctx.body } });
  await adoptWaId(ctx, r);
  return recordOutbound(ctx, r.messages?.[0]?.id || `local.${Date.now()}`, "text", ctx.body);
}

export async function sendMedia(s: Settings, ctx: SendCtx & { kind: "image" | "video" | "audio" | "document" | "sticker"; mediaId: string; mime?: string | null; caption?: string | null; filename?: string | null }) {
  const g = await sender(s, ctx.phoneNumberId);
  const obj: any = { id: ctx.mediaId };
  if (ctx.caption && ctx.kind !== "audio" && ctx.kind !== "sticker") obj.caption = ctx.caption;
  if (ctx.filename && ctx.kind === "document") obj.filename = ctx.filename;
  const r = await g.json(`${ctx.phoneNumberId}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", to: ctx.to, type: ctx.kind, [ctx.kind]: obj });
  await adoptWaId(ctx, r);
  return recordOutbound(ctx, r.messages?.[0]?.id || `local.${Date.now()}`, ctx.kind, ctx.caption ?? null, { media_id: ctx.mediaId, media_mime: ctx.mime ?? null, media_filename: ctx.filename ?? null });
}

export type TemplateSend = { name: string; language: string; components?: any[]; preview?: string };

export async function sendTemplate(s: Settings, ctx: SendCtx & { template: TemplateSend }) {
  const g = await sender(s, ctx.phoneNumberId);
  const t = ctx.template;
  const payload: any = { messaging_product: "whatsapp", recipient_type: "individual", to: ctx.to, type: "template", template: { name: t.name, language: { code: t.language } } };
  if (t.components?.length) payload.template.components = t.components;
  const r = await g.json(`${ctx.phoneNumberId}/messages`, payload);
  await adoptWaId(ctx, r);
  return recordOutbound(ctx, r.messages?.[0]?.id || `local.${Date.now()}`, "template", t.preview || t.name, { template_name: t.name, payload: payload.template });
}

export type InteractiveSpec = {
  body: string; header?: string | null; footer?: string | null;
  buttons?: { id: string; title: string }[];
  list?: { button: string; rows: { id: string; title: string; description?: string | null }[] } | null;
};

/** Mensagem interativa (botões de resposta rápida ou lista) — só dentro da janela de 24 h. */
export async function sendInteractive(s: Settings, ctx: SendCtx & InteractiveSpec) {
  const g = await sender(s, ctx.phoneNumberId);
  const interactive: any = { type: ctx.list ? "list" : "button", body: { text: ctx.body.slice(0, 1024) } };
  if (ctx.header) interactive.header = { type: "text", text: ctx.header.slice(0, 60) };
  if (ctx.footer) interactive.footer = { text: ctx.footer.slice(0, 60) };
  if (ctx.list) {
    interactive.action = {
      button: (ctx.list.button || "Ver opções").slice(0, 20),
      sections: [{ title: "Opções", rows: ctx.list.rows.slice(0, 10).map((r) => ({ id: r.id.slice(0, 200), title: r.title.slice(0, 24), ...(r.description ? { description: r.description.slice(0, 72) } : {}) })) }],
    };
  } else {
    interactive.action = { buttons: (ctx.buttons || []).slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) };
  }
  const r = await g.json(`${ctx.phoneNumberId}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", to: ctx.to, type: "interactive", interactive });
  await adoptWaId(ctx, r);
  const summary = ctx.list ? `${ctx.body}\n[${ctx.list.rows.map((x) => x.title).join(" · ")}]` : `${ctx.body}\n[${(ctx.buttons || []).map((x) => x.title).join(" · ")}]`;
  return recordOutbound(ctx, r.messages?.[0]?.id || `local.${Date.now()}`, "interactive", summary, { payload: interactive });
}

export async function markRead(s: Settings, phoneNumberId: string, wamid: string) {
  try { await (await graphForPhone(s, phoneNumberId)).json(`${phoneNumberId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: wamid }); } catch { /* opcional */ }
}

/** Sobe um arquivo para a Meta e devolve o id de mídia. */
export async function uploadMedia(s: Settings, phoneNumberId: string, file: Blob, mime: string, filename: string) {
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", mime);
  form.set("file", file, filename);
  const r = await (await graphForPhone(s, phoneNumberId)).form<{ id: string }>(`${phoneNumberId}/media`, form);
  return r.id;
}

/** Resolve a URL temporária de uma mídia e baixa o conteúdo. */
export async function fetchMedia(s: Settings, mediaId: string, phoneNumberId?: string | null, only?: (c: { visibility: string }) => boolean) {
  // a mídia pertence a um número: usa o token da BM dele; sem pista, tenta as conexões (permitidas) até uma reconhecer o id
  const pid = phoneNumberId || (await query<{ phone_number_id: string }>("select phone_number_id from messages where media_id = $1 and phone_number_id is not null limit 1", [mediaId]))[0]?.phone_number_id;
  const tries: Graph[] = pid ? [await graphForPhone(s, pid)] : (await listConnections()).filter((c) => c.active && (!only || only(c))).map((c) => graphOf(s, c));
  if (!tries.length) tries.push(graphOf(s, null));
  let last: any = null;
  for (const g of tries) {
    try {
      const info = await g.get<{ url: string; mime_type: string; file_size?: number }>(mediaId);
      const res = await g.download(info.url);
      return { res, mime: info.mime_type, size: info.file_size };
    } catch (e) { last = e; }
  }
  throw last || new Error("mídia indisponível");
}

/** Preenche o texto do template com os parâmetros para guardar uma prévia legível. */
export function renderTemplatePreview(components: any[] | null | undefined, bodyParams: string[]) {
  const body = (components || []).find((c: any) => c?.type === "BODY")?.text || "";
  return body.replace(/\{\{(\d+)\}\}/g, (_: string, n: string) => bodyParams[Number(n) - 1] ?? `{{${n}}}`);
}

// ---------- manutenção ----------

/** Encerra conversas paradas (sem mensagem nova há N dias). */
export async function autoCloseStale(days: number) {
  if (!days) return 0;
  const rows = await query<{ id: number }>(
    `update conversations set status = 'closed', closed_at = case when status = 'disparo' then closed_at else now() end
     where status <> 'closed' and last_message_at < now() - ($1 || ' days')::interval returning id`,
    [String(days)],
  );
  for (const r of rows) await logEvent(r.id, "closed", null, { by: "auto" });
  return rows.length;
}

export { logEvent };
