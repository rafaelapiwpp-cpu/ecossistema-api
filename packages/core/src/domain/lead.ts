import type { E164, ISODateTime, SoftDelete, Timestamps } from "./common";
import type { ConsentEventId, ContactListId, LeadId, TenantId, UserId } from "./ids";

/**
 * Contatos (leads) e consentimento.
 *
 * Princípio LGPD + política da Meta: o consentimento é um LOG imutável
 * (ConsentEvent). O campo `Lead.consent` é só uma projeção do último evento,
 * mantida para filtrar rápido na hora do disparo. Opt-out vence sempre e é
 * aplicado antes de qualquer envio, em qualquer campanha do tenant.
 */

export type ConsentStatus = "opted_in" | "opted_out" | "unknown";

export type ConsentSource =
  | "web_form" // formulário com checkbox não pré-marcado
  | "checkout"
  | "whatsapp_inbound" // cliente iniciou a conversa
  | "whatsapp_keyword" // palavra-chave (ex.: "SAIR", "PARAR")
  | "opt_out_button" // botão de descadastro de marketing da Meta
  | "import" // planilha importada com declaração de origem
  | "api"
  | "support_request" // titular pediu pelo atendimento
  | "admin";

export interface LeadConsent {
  status: ConsentStatus;
  source: ConsentSource | null;
  changedAt: ISODateTime | null;
}

/**
 * Estágio comercial do contato (o que o Portal do Cliente mostra como funil).
 * É um eixo SEPARADO do consentimento: opt-out não é um estágio, é
 * `consent.status = "opted_out"`, e vence qualquer estágio. Um lead
 * "interested" que pede para sair continua "interested" no histórico, mas
 * nunca mais recebe marketing.
 */
export type LeadStage =
  | "new" // importado/capturado, ainda sem resposta
  | "replied" // respondeu alguma mensagem
  | "interested" // marcado como interessado (botão, palavra-chave ou operador)
  | "invalid"; // número inexistente / sem WhatsApp (erro 131026 recorrente)

export type LeadAttributeValue = string | number | boolean | null;

export interface Lead extends Timestamps, SoftDelete {
  id: LeadId;
  tenantId: TenantId;
  /** Único por tenant. */
  phone: E164;
  name: string | null;
  email: string | null;
  /** Campos livres do cliente (cidade, plano, data da última compra…). */
  attributes: Record<string, LeadAttributeValue>;
  tags: string[];
  stage: LeadStage;
  stageChangedAt: ISODateTime | null;
  consent: LeadConsent;
  /** Última mensagem recebida do contato: abre a janela de atendimento de 24 h. */
  lastInboundAt: ISODateTime | null;
  /** Anonimizado por pedido do titular ou fim do prazo de retenção. */
  anonymizedAt: ISODateTime | null;
}

export interface ConsentEvidence {
  ip?: string;
  userAgent?: string;
  formUrl?: string;
  /** wamid da mensagem em que o contato pediu para sair. */
  messageWamid?: string;
  keyword?: string;
  importBatchId?: string;
  note?: string;
}

/** Linha imutável (append-only). Nunca atualizar nem apagar — só anonimizar o telefone. */
export interface ConsentEvent {
  id: ConsentEventId;
  tenantId: TenantId;
  leadId: LeadId;
  type: "opt_in" | "opt_out";
  source: ConsentSource;
  evidence: ConsentEvidence;
  occurredAt: ISODateTime;
  recordedBy: UserId | null;
}

export interface ContactList extends Timestamps {
  id: ContactListId;
  tenantId: TenantId;
  name: string;
  description: string | null;
  leadCount: number;
}

/** Palavras que disparam opt-out automático em mensagens recebidas. Comparação sem acento e sem caixa. */
export const DEFAULT_OPT_OUT_KEYWORDS = ["sair", "parar", "pare", "cancelar", "descadastrar", "stop"] as const;

export function canReceiveMarketing(lead: Pick<Lead, "consent" | "deletedAt" | "anonymizedAt">): boolean {
  return lead.consent.status === "opted_in" && lead.deletedAt === null && lead.anonymizedAt === null;
}
