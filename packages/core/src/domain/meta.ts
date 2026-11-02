import type { CurrencyCode, E164, ISODateTime, Timestamps } from "./common";
import type { BusinessManagerId, PhoneNumberId, TenantId, WabaId } from "./ids";

/**
 * Ativos da Meta: Business Manager (portfólio empresarial) -> WABA -> números.
 *
 * Os enums em CAIXA ALTA espelham os valores da Graph API para que a
 * sincronização (webhooks + polling) grave o que a Meta devolve sem tradução.
 * Rótulos em português ficam na camada de UI.
 */

/* ------------------------------------------------------------------ */
/* Business Manager (portfólio empresarial)                            */
/* ------------------------------------------------------------------ */

/**
 * Limite de mensagens iniciadas pela empresa por 24 h móveis.
 * Desde out/2025 o limite é do PORTFÓLIO (BM), compartilhado entre todos os
 * números dele — por isso mora aqui e não no número.
 * Graph API: campo `whatsapp_business_manager_messaging_limit` (ex.: "TIER_250").
 */
export type MessagingLimitTier = "TIER_250" | "TIER_2K" | "TIER_10K" | "TIER_100K" | "TIER_UNLIMITED";

export const MESSAGING_LIMIT_VALUE: Record<MessagingLimitTier, number | null> = {
  TIER_250: 250,
  TIER_2K: 2_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: null,
};

export type BusinessVerificationStatus = "verified" | "pending" | "not_verified" | "rejected";

/**
 * De quem é a BM:
 * - "client": o cliente conectou a própria BM via Embedded Signup (recomendado; ativos ficam no nome dele)
 * - "platform": BM da plataforma operando em nome do cliente
 */
export type BusinessManagerOwnership = "client" | "platform";

/**
 * Situação do portfólio perante a Meta (enforcement). Independe da verificação
 * e do token: uma BM verificada e com token válido pode estar restrita.
 * Restrita/banida = nada sai dela; o caminho é revisão/recurso na Meta (doc 04 §4.3).
 */
export type BusinessAccountStatus = "active" | "restricted" | "banned";

/** Saúde da credencial (system user token) que usamos para operar a BM. */
export type BusinessConnectionStatus = "active" | "token_expiring" | "token_invalid" | "revoked";

export interface BusinessManager extends Timestamps {
  id: BusinessManagerId;
  tenantId: TenantId;
  metaBusinessId: string;
  name: string;
  ownership: BusinessManagerOwnership;
  verificationStatus: BusinessVerificationStatus;
  messagingLimitTier: MessagingLimitTier;
  connectionStatus: BusinessConnectionStatus;
  accountStatus: BusinessAccountStatus;
  tokenExpiresAt: ISODateTime | null;
  lastSyncedAt: ISODateTime | null;
}

/* ------------------------------------------------------------------ */
/* WABA (WhatsApp Business Account)                                    */
/* ------------------------------------------------------------------ */

export type WabaReviewStatus = "APPROVED" | "PENDING" | "REJECTED";

export interface WhatsAppBusinessAccount extends Timestamps {
  id: WabaId;
  tenantId: TenantId;
  businessManagerId: BusinessManagerId;
  metaWabaId: string;
  name: string;
  currency: CurrencyCode;
  timezoneId: string;
  reviewStatus: WabaReviewStatus;
  /** Nosso app está inscrito nos webhooks desta WABA? Sem isso não recebemos status nem opt-outs. */
  webhookSubscribed: boolean;
}

/* ------------------------------------------------------------------ */
/* Número de telefone                                                  */
/* ------------------------------------------------------------------ */

/** Qualidade do número segundo a Meta (`quality_rating`). GREEN = alta, YELLOW = média, RED = baixa. */
export type QualityRating = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

/** Status do número na Graph API (`status`). */
export type PhoneNumberStatus =
  | "CONNECTED"
  | "PENDING"
  | "FLAGGED" // qualidade baixa sustentada; risco de restrição
  | "RESTRICTED" // limite reduzido temporariamente pela Meta
  | "RATE_LIMITED"
  | "DISCONNECTED"
  | "BANNED"
  | "MIGRATED"
  | "UNVERIFIED"
  | "DELETED"
  | "UNKNOWN";

export type DisplayNameStatus = "APPROVED" | "PENDING_REVIEW" | "DECLINED" | "NONE";

/** Vazão da Cloud API: STANDARD ≈ 80 msg/s, HIGH ≈ até 1.000 msg/s. */
export type ThroughputLevel = "STANDARD" | "HIGH";

export interface PhoneNumber extends Timestamps {
  id: PhoneNumberId;
  tenantId: TenantId;
  businessManagerId: BusinessManagerId;
  wabaId: WabaId;
  metaPhoneNumberId: string;
  displayPhoneNumber: E164;
  verifiedName: string;
  displayNameStatus: DisplayNameStatus;
  qualityRating: QualityRating;
  status: PhoneNumberStatus;
  throughput: ThroughputLevel;
  isOfficialBusinessAccount: boolean;
  /** Apelido interno ("Vendas SP", "Cobrança"). */
  label: string | null;
  /** Interruptor do admin para este número, independente do status na Meta. */
  sendingEnabled: boolean;
  qualityChangedAt: ISODateTime | null;
  lastHealthCheckAt: ISODateTime | null;
}

/** Números que podem receber novos envios agora. */
export function isSendable(n: Pick<PhoneNumber, "status" | "sendingEnabled">): boolean {
  return n.sendingEnabled && (n.status === "CONNECTED" || n.status === "FLAGGED");
}
