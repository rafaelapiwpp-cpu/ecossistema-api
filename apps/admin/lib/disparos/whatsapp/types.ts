/**
 * Contrato entre o domínio e o provedor de WhatsApp.
 * O MockProvider e o MetaCloudProvider implementam a mesma interface; o resto
 * do sistema não sabe qual está ativo.
 */

export type OutboundMessage =
  | {
      type: 'template';
      name: string;
      language: string;            // pt_BR
      bodyParams: string[];        // valores de {{1}}, {{2}}...
      quickReplyPayloads: string[];// payload por índice de botão quick reply
      /** Metadado local (simulador/telas). Não vai para a Meta: toMetaPayload monta o JSON campo a campo. */
      meta?: { category: string; buttons: { text: string; optOut?: boolean }[] };
    }
  | { type: 'text'; body: string; previewUrl?: boolean }
  | { type: 'audio'; mediaId?: string; link?: string; voice: boolean }
  | {
      type: 'interactive_buttons';
      body: string;
      buttons: { id: string; title: string }[];  // até 3, título até 20
      footer?: string;
    };

export interface SendRequest {
  phoneNumberId: string;           // ID da Meta do número remetente
  to: string;                      // E.164 com "+"
  message: OutboundMessage;
  /** Volta em todos os webhooks de status desta mensagem. Usamos para amarrar run/etapa. */
  bizOpaqueCallbackData?: string;
}

export interface SendResult { waMessageId: string }

export interface WhatsAppProvider {
  readonly kind: 'mock' | 'meta';
  send(req: SendRequest): Promise<SendResult>;
}

export class WhatsAppApiError extends Error {
  constructor(
    public readonly code: number,
    public readonly title: string,
    public readonly retryable: boolean,
    public readonly details?: string,
  ) {
    super(`[${code}] ${title}`);
    this.name = 'WhatsAppApiError';
  }
}

// ---- eventos normalizados (saída do parser de webhook) -----------------------

export type StatusValue = 'sent' | 'delivered' | 'read' | 'failed' | 'played';

export interface StatusEvent {
  kind: 'status';
  phoneNumberId: string;
  waMessageId: string;
  status: StatusValue;
  timestamp: number;               // epoch ms
  recipient: string;               // E.164
  bizOpaqueCallbackData?: string;
  error?: { code: number; title: string; details?: string };
  pricing?: { category?: string; type?: string };
}

export interface InboundEvent {
  kind: 'inbound';
  phoneNumberId: string;
  waMessageId: string;
  from: string;                    // E.164
  profileName?: string;
  timestamp: number;               // epoch ms
  type: string;                    // text | button | interactive | audio | image | ...
  text?: string;
  buttonPayload?: string;          // id do reply button OU payload do quick reply do modelo
  buttonText?: string;
  contextWaMessageId?: string;     // mensagem à qual o contato respondeu
}

export type WebhookEvent = StatusEvent | InboundEvent;

/** Ordem de status: impede que um "delivered" atrasado sobrescreva um "read". */
export const STATUS_RANK = {
  queued: 0, accepted: 1, sent: 2, delivered: 3, read: 4, played: 5, failed: 9,
} as const satisfies Record<string, number>;

export const toE164 = (waId: string) => (waId.startsWith('+') ? waId : `+${waId}`);
export const toWaId = (e164: string) => e164.replace(/^\+/, '');

/** Erros da Cloud API com tratamento específico. */
export const META_ERRORS = {
  SERVICE_WINDOW_EXPIRED: 131047,   // fora da janela de 24h
  ENGAGEMENT_WITHHELD: 131049,      // retida para proteger engajamento do destinatário
  MARKETING_OPTED_OUT: 131050,      // contato parou marketing pelo próprio WhatsApp -> blacklist
  UNDELIVERABLE: 131026,
  PAIR_RATE_LIMIT: 131056,          // muitas mensagens pro mesmo contato em pouco tempo
  SPAM_RATE_LIMITED: 131048,
  THROUGHPUT: 130429,
  TEMPLATE_PAUSED: 132015,
  TEMPLATE_DISABLED: 132016,
} as const;
