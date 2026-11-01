import type { ISODate, ISODateTime, Micros } from "./common";
import type { BusinessManagerId, PhoneNumberId, TenantId } from "./ids";
import type { PricingCategory } from "./message";

/**
 * Rollups. Gravados por um job a partir de `messages` + webhooks, para que
 * nenhum dashboard faça COUNT(*) na tabela de mensagens.
 *
 * - hourly_number_stats: PK (phone_number_id, hour). Base das janelas móveis (últimas 24 h).
 * - daily_number_stats:  PK (phone_number_id, date). Agregado do horário, data em America/Sao_Paulo.
 */
export interface HourlyNumberStats {
  /** Início da hora, em UTC. */
  hour: ISODateTime;
  tenantId: TenantId;
  businessManagerId: BusinessManagerId;
  phoneNumberId: PhoneNumberId;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  inbound: number;
  optOuts: number;
}

export interface DailyNumberStats {
  date: ISODate;
  tenantId: TenantId;
  businessManagerId: BusinessManagerId;
  phoneNumberId: PhoneNumberId;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  inbound: number;
  optOuts: number;
  /** Destinatários únicos de mensagens iniciadas pela empresa fora da janela de atendimento (o que conta para o limite). */
  businessInitiatedRecipients: number;
  billableByCategory: Record<PricingCategory, number>;
  estimatedCostMicros: Micros;
}

/** Uso do limite de 24 h móveis de uma BM. Calculado continuamente pelo worker de disparo. */
export interface PortfolioLimitUsage {
  businessManagerId: BusinessManagerId;
  windowStart: ISODateTime;
  windowEnd: ISODateTime;
  uniqueRecipients: number;
  /** null = ilimitado. */
  limit: number | null;
}

/** Janela móvel de 24 h comparada com as 24 h anteriores. */
export interface RollingTotals {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  optOuts: number;
}
