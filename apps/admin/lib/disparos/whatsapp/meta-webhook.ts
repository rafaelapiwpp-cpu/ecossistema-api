/**
 * Webhook da WhatsApp Cloud API: verificação de assinatura + parser para eventos
 * normalizados. O MockProvider gera payloads NESTE MESMO FORMATO, então o caminho
 * de processamento é o mesmo nos dois modos.
 */
import { InboundEvent, StatusEvent, StatusValue, WebhookEvent, toE164 } from './types';

/** Valida X-Hub-Signature-256 ("sha256=<hex>") com o App Secret. Usa Web Crypto (Node 18+ e browser). */
export async function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(rawBody)));
  const expected = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
  const got = header.slice(7).toLowerCase();
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** GET de verificação do endpoint (hub.mode=subscribe). Devolve o challenge ou null. */
export function verifySubscription(url: URL, verifyToken: string): string | null {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  return mode === 'subscribe' && token === verifyToken && challenge ? challenge : null;
}

// ---- formato da Meta (só o que usamos) ---------------------------------------

export interface MetaWebhookPayload {
  object: 'whatsapp_business_account';
  entry: {
    id: string;
    changes: {
      field: string;
      value: {
        messaging_product: 'whatsapp';
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: { profile?: { name?: string }; wa_id: string }[];
        messages?: MetaInboundMessage[];
        statuses?: MetaStatus[];
      };
    }[];
  }[];
}

export interface MetaInboundMessage {
  from: string;
  id: string;
  timestamp: string;              // unix segundos (string)
  type: string;
  text?: { body: string };
  button?: { payload: string; text: string };                         // quick reply de modelo
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  context?: { from?: string; id?: string };
}

export interface MetaStatus {
  id: string;
  status: StatusValue;
  timestamp: string;
  recipient_id: string;
  biz_opaque_callback_data?: string;
  pricing?: { pricing_model?: string; type?: string; category?: string };
  errors?: { code: number; title: string; message?: string; error_data?: { details?: string } }[];
}

export function parseMetaWebhook(payload: MetaWebhookPayload): WebhookEvent[] {
  const out: WebhookEvent[] = [];
  if (payload?.object !== 'whatsapp_business_account') return out;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const v = change.value;
      const phoneNumberId = v.metadata?.phone_number_id;
      const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      for (const st of v.statuses ?? []) {
        const err = st.errors?.[0];
        const ev: StatusEvent = {
          kind: 'status',
          phoneNumberId,
          waMessageId: st.id,
          status: st.status,
          timestamp: Number(st.timestamp) * 1000,
          recipient: toE164(st.recipient_id),
          bizOpaqueCallbackData: st.biz_opaque_callback_data,
          error: err ? { code: err.code, title: err.title, details: err.error_data?.details } : undefined,
          pricing: st.pricing ? { category: st.pricing.category, type: st.pricing.type } : undefined,
        };
        out.push(ev);
      }

      for (const m of v.messages ?? []) {
        const ev: InboundEvent = {
          kind: 'inbound',
          phoneNumberId,
          waMessageId: m.id,
          from: toE164(m.from),
          profileName: names.get(m.from),
          timestamp: Number(m.timestamp) * 1000,
          type: m.type,
          contextWaMessageId: m.context?.id,
        };
        if (m.type === 'text') ev.text = m.text?.body;
        if (m.type === 'button') {
          ev.buttonPayload = m.button?.payload;
          ev.buttonText = m.button?.text;
          ev.text = m.button?.text;
        }
        if (m.type === 'interactive') {
          const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
          ev.buttonPayload = r?.id;
          ev.buttonText = r?.title;
          ev.text = r?.title;
        }
        out.push(ev);
      }
    }
  }
  return out;
}

// ---- construtores (usados pelo mock e pelos testes) --------------------------

export function buildStatusWebhook(
  phoneNumberId: string, display: string, st: MetaStatus,
): MetaWebhookPayload {
  return wrap(phoneNumberId, display, { statuses: [st] });
}

export function buildInboundWebhook(
  phoneNumberId: string, display: string, msg: MetaInboundMessage, profileName?: string,
): MetaWebhookPayload {
  return wrap(phoneNumberId, display, {
    contacts: [{ wa_id: msg.from, profile: { name: profileName } }],
    messages: [msg],
  });
}

function wrap(
  phoneNumberId: string, display: string,
  value: Partial<MetaWebhookPayload['entry'][0]['changes'][0]['value']>,
): MetaWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA_ID',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: display, phone_number_id: phoneNumberId },
          ...value,
        },
      }],
    }],
  };
}
