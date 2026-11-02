/**
 * Provider real: WhatsApp Cloud API (Graph API v26.0).
 * Fica pronto mas só é usado com WHATSAPP_PROVIDER=meta.
 *
 *   POST https://graph.facebook.com/v26.0/{phone_number_id}/messages
 *   Authorization: Bearer <token do system user do tenant>
 */
import {
  OutboundMessage, SendRequest, SendResult, WhatsAppApiError, WhatsAppProvider, toWaId,
} from './types';

export const GRAPH_VERSION = 'v26.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Códigos que valem tentar de novo mais tarde (o worker devolve para a fila). */
const RETRYABLE_CODES = new Set([1, 2, 4, 80007, 130429, 131000, 131056]);

export interface MetaProviderOptions {
  /** Busca o token do tenant dono do número (cofre/KMS). Nunca guardar token em claro no banco. */
  getAccessToken: (phoneNumberId: string) => Promise<string>;
  fetchImpl?: typeof fetch;
}

export class MetaCloudProvider implements WhatsAppProvider {
  readonly kind = 'meta' as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: MetaProviderOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async send(req: SendRequest): Promise<SendResult> {
    const token = await this.opts.getAccessToken(req.phoneNumberId);
    const res = await this.fetchImpl(`${GRAPH}/${req.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(toMetaPayload(req)),
    });
    const json = (await res.json().catch(() => ({}))) as MetaSendResponse;
    if (!res.ok || json.error) throw toApiError(res.status, json);
    const id = json.messages?.[0]?.id;
    if (!id) throw new WhatsAppApiError(0, 'Resposta da Meta sem id de mensagem', true);
    return { waMessageId: id };
  }

  /** Sobe mídia (ex.: nota de voz .ogg) e devolve o media id para usar em AudioData.mediaId. */
  async uploadMedia(phoneNumberId: string, file: Blob, fileName: string): Promise<string> {
    const token = await this.opts.getAccessToken(phoneNumberId);
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', file.type);
    form.append('file', file, fileName);
    const res = await this.fetchImpl(`${GRAPH}/${phoneNumberId}/media`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string } & MetaSendResponse;
    if (!res.ok || !json.id) throw toApiError(res.status, json);
    return json.id;
  }

  /** Limite de mensagens do portfólio (TIER_250, TIER_2K, ...). */
  async getMessagingLimit(phoneNumberId: string): Promise<string | null> {
    const token = await this.opts.getAccessToken(phoneNumberId);
    const res = await this.fetchImpl(
      `${GRAPH}/${phoneNumberId}?fields=whatsapp_business_manager_messaging_limit`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = (await res.json().catch(() => ({}))) as { whatsapp_business_manager_messaging_limit?: string };
    return json.whatsapp_business_manager_messaging_limit ?? null;
  }
}

// ---- payloads ----------------------------------------------------------------

export function toMetaPayload(req: SendRequest): Record<string, unknown> {
  const base: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWaId(req.to),
  };
  if (req.bizOpaqueCallbackData) base.biz_opaque_callback_data = req.bizOpaqueCallbackData.slice(0, 512);
  return { ...base, ...messageBody(req.message) };
}

function messageBody(m: OutboundMessage): Record<string, unknown> {
  switch (m.type) {
    case 'text':
      return { type: 'text', text: { body: m.body, preview_url: m.previewUrl ?? false } };

    case 'audio': {
      const audio: Record<string, unknown> = m.mediaId ? { id: m.mediaId } : { link: m.link };
      if (m.voice) audio.voice = true;
      return { type: 'audio', audio };
    }

    case 'template': {
      const components: Record<string, unknown>[] = [];
      if (m.bodyParams.length) {
        components.push({ type: 'body', parameters: m.bodyParams.map((text) => ({ type: 'text', text })) });
      }
      m.quickReplyPayloads.forEach((payload, index) => {
        components.push({
          type: 'button', sub_type: 'quick_reply', index: String(index),
          parameters: [{ type: 'payload', payload }],
        });
      });
      return {
        type: 'template',
        template: { name: m.name, language: { code: m.language }, ...(components.length ? { components } : {}) },
      };
    }

    case 'interactive_buttons':
      return {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: m.body },
          ...(m.footer ? { footer: { text: m.footer } } : {}),
          action: {
            buttons: m.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
          },
        },
      };
  }
}

interface MetaSendResponse {
  messages?: { id: string; message_status?: string }[];
  error?: { message: string; code: number; error_data?: { details?: string }; error_subcode?: number };
}

function toApiError(httpStatus: number, json: MetaSendResponse): WhatsAppApiError {
  const e = json.error;
  const code = e?.code ?? httpStatus;
  const retryable = httpStatus === 429 || httpStatus >= 500 || RETRYABLE_CODES.has(code);
  return new WhatsAppApiError(code, e?.message ?? `HTTP ${httpStatus}`, retryable, e?.error_data?.details);
}
