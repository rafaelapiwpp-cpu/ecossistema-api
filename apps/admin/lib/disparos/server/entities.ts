/**
 * Entidades em camelCase, 1:1 com as tabelas da migration.
 * Datas como epoch ms (number) — o PgRepo converte para timestamptz.
 */
import type { FlowGraph } from '../domain/flow-types';
import type { RunStatus } from '../domain/flow-engine';

export type ID = string;

export type MessagingTier = 'TIER_250' | 'TIER_1K' | 'TIER_2K' | 'TIER_10K' | 'TIER_100K' | 'TIER_UNLIMITED';
export const TIER_LIMIT: Record<MessagingTier, number> = {
  TIER_250: 250, TIER_1K: 1000, TIER_2K: 2000, TIER_10K: 10000, TIER_100K: 100000, TIER_UNLIMITED: Infinity,
};

export interface BusinessAccount {
  id: ID; tenantId: ID; wabaId: string; name: string; messagingLimitTier: MessagingTier;
}

export interface PhoneNumber {
  id: ID; tenantId: ID; businessAccountId: ID;
  phoneNumberId: string;            // ID da Meta
  displayPhoneNumber: string; verifiedName: string;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  provider: 'mock' | 'meta';
  /** status do cadastro (doc 04 §4.2), ex.: ativo, aquecendo, limitado, banido */
  status: string;
  /** Só número ativo/aquecendo e sem qualidade baixa recebe tráfego (doc 04 §4.4). */
  canSend: boolean;
}

export interface TemplateButton { text: string; optOut?: boolean }
export interface Template {
  id: ID; tenantId: ID; businessAccountId: ID;
  name: string; language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED';
  bodyText: string;                 // components[type=BODY].text
  variableExamples: string[];
  buttons: TemplateButton[];        // components[type=BUTTONS] quick replies
}

/** Igual ao @eco/core (ConsentStatus / ConsentSource). */
export type ConsentStatus = 'opted_in' | 'opted_out' | 'unknown';
export type ConsentSource =
  | 'web_form' | 'checkout' | 'whatsapp_inbound' | 'whatsapp_keyword' | 'opt_out_button'
  | 'import' | 'api' | 'support_request' | 'admin';

export interface Contact {
  id: ID; tenantId: ID; name: string; phoneE164: string; tags: string[];
  attributes: Record<string, string>;
  /** Projeção do último ConsentEvent. Campanha só envia para opted_in. */
  consent: ConsentStatus;
  consentSource: ConsentSource | null;
  consentAt: number | null;
  createdAt: number;
}

/** Log imutável de consentimento (append-only). */
export interface ConsentEvent {
  id: ID; tenantId: ID; contactId: ID | null; phoneE164: string;
  status: 'opted_in' | 'opted_out';
  source: ConsentSource;
  note: string | null; keyword: string | null; waMessageId: string | null;
  campaignId: ID | null; flowRunId: ID | null;
  createdAt: number;
}

export type OptOutSource = 'keyword' | 'button' | 'flow_node' | 'meta_marketing_optout' | 'manual' | 'import';
export interface OptOut {
  id: ID; tenantId: ID; phoneE164: string; contactId: ID | null; contactName: string | null;
  source: OptOutSource; reason: string | null; triggerText: string | null;
  campaignId: ID | null; flowRunId: ID | null; waMessageId: string | null;
  createdAt: number; revokedAt: number | null; revokeReason: string | null;
}

export interface Flow {
  id: ID; tenantId: ID; name: string; description: string | null;
  status: 'draft' | 'published' | 'archived';
  draftGraph: FlowGraph; publishedVersionId: ID | null;
  createdAt: number; updatedAt: number;
}

export interface FlowVersion {
  id: ID; tenantId: ID; flowId: ID; version: number; graph: FlowGraph; publishedAt: number;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'canceled' | 'failed';
export interface Audience { tags: string[]; all?: boolean }
export interface Campaign {
  id: ID; tenantId: ID; name: string;
  phoneNumberId: ID; flowId: ID; flowVersionId: ID;
  status: CampaignStatus;
  pauseReason: string | null;
  /** Freio temporário enquanto roda (ex.: limite diário da Meta). Não muda o status. */
  blockedReason: 'messaging_limit' | null;
  audience: Audience; ratePerMinute: number; totalRecipients: number;
  scheduledAt: number | null; startedAt: number | null; finishedAt: number | null;
  lastDispatchAt: number | null;
  createdAt: number; updatedAt: number;
}

export type RecipientStatus =
  | 'pending' | 'skipped_optout' | 'skipped_no_consent' | 'skipped_invalid' | 'processing'
  | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed';
export interface Recipient {
  id: ID; tenantId: ID; campaignId: ID; contactId: ID | null;
  phoneE164: string; name: string; variables: Record<string, string>;
  status: RecipientStatus; attempts: number;
  flowRunId: ID | null; waMessageId: string | null;
  errorCode: number | null; errorTitle: string | null;
  acceptedAt: number | null; sentAt: number | null; deliveredAt: number | null;
  readAt: number | null; failedAt: number | null; updatedAt: number;
}

export interface FlowRun {
  id: ID; tenantId: ID; flowId: ID; flowVersionId: ID;
  campaignId: ID | null; campaignRecipientId: ID | null;
  phoneNumberId: ID; contactId: ID | null; phoneE164: string;
  status: RunStatus; currentNodeId: string | null; wakeAt: number | null;
  context: { vars: Record<string, string>; answers: Record<string, string> };
  stepCount: number; lastError: string | null;
  startedAt: number; finishedAt: number | null; updatedAt: number;
}

export interface RunStep {
  id: number; tenantId: ID; runId: ID; campaignId: ID | null;
  nodeId: string; nodeType: string; outcome: string;
  messageId: ID | null; detail: Record<string, unknown> | null; createdAt: number;
}

export type MessageStatus = 'queued' | 'accepted' | 'sent' | 'delivered' | 'read' | 'played' | 'failed' | 'received';
export interface Message {
  id: ID; tenantId: ID; phoneNumberId: ID; contactId: ID | null; phoneE164: string;
  direction: 'in' | 'out'; waMessageId: string | null;
  type: string; payload: unknown; preview: string;
  status: MessageStatus; statusRank: number;
  campaignId: ID | null; flowRunId: ID | null; nodeId: string | null;
  bizOpaqueCallbackData: string | null;
  errorCode: number | null; errorTitle: string | null;
  pricingCategory: string | null; pricingType: string | null;
  createdAt: number; sentAt: number | null; deliveredAt: number | null; readAt: number | null; failedAt: number | null;
}

export interface CampaignStats {
  total: number;
  queued: number;       // pending + processing
  sent: number;         // aceitas pela API em diante (accepted|sent|delivered|read)
  delivered: number;    // delivered|read
  read: number;
  failed: number;
  skipped: number;      // blacklist / sem consentimento / inválido
  skippedOptout: number;
  skippedNoConsent: number;
  inProgress: number;   // execuções ainda no fluxo (aguardando tempo ou resposta)
  finished: number;     // execuções encerradas + falhas + puladas
  optedOutDuringFlow: number;
  percentDone: number;  // finished / total
}

export interface FunnelRow {
  nodeId: string;
  reached: number;
  outcomes: Record<string, number>;   // sent, waiting, reply:<key>, timeout, opted_out, window_closed...
}
