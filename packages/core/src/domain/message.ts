import type { ISODateTime, Micros } from "./common";
import type { CampaignId, LeadId, MessageId, PhoneNumberId, TemplateId, TenantId } from "./ids";

/**
 * Mensagem individual. É a tabela de maior volume do sistema:
 * no Postgres, particionar por mês (created_at) e indexar (tenant_id, created_at)
 * e UNIQUE (wamid). Dashboards NÃO leem daqui — leem os rollups de metrics.ts.
 */

export type MessageDirection = "outbound" | "inbound";

/** Ciclo de vida: na fila -> enviada (✓) -> entregue (✓✓) -> lida (✓✓ azul), ou falha. */
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

/**
 * Cobrança por mensagem (PMP) da Meta, vigente desde jul/2025.
 * Valores espelham o objeto `pricing` do webhook de status.
 */
export type PricingCategory = "marketing" | "utility" | "authentication" | "authentication_international" | "service";

/** `free_entry_point`: janela de 7 dias após anúncio Click-to-WhatsApp. Conferir na referência do webhook ao integrar. */
export type PricingType = "regular" | "free_customer_service" | "free_entry_point";

export interface MessagePricing {
  billable: boolean;
  model: "PMP";
  category: PricingCategory;
  type: PricingType;
}

export interface MessageError {
  /** Código de erro da Cloud API (ex.: 131049, 131026). */
  code: number;
  title: string;
}

export interface Message {
  id: MessageId;
  tenantId: TenantId;
  phoneNumberId: PhoneNumberId;
  leadId: LeadId | null;
  campaignId: CampaignId | null;
  templateId: TemplateId | null;
  direction: MessageDirection;
  /** ID da Meta; null enquanto está só na nossa fila. */
  wamid: string | null;
  status: MessageStatus;
  error: MessageError | null;
  pricing: MessagePricing | null;
  /** Estimativa pela tabela de preços vigente; o valor final vem da fatura da Meta. */
  estimatedCostMicros: Micros | null;
  createdAt: ISODateTime;
  sentAt: ISODateTime | null;
  deliveredAt: ISODateTime | null;
  readAt: ISODateTime | null;
  failedAt: ISODateTime | null;
}
