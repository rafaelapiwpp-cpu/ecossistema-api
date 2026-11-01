import type {
  AlertSeverity,
  BusinessVerificationStatus,
  HealthStatus,
  MessagingLimitTier,
  PhoneNumberStatus,
  QualityRating,
  TenantStatus,
} from "@eco/core";
import { STATUS } from "@eco/tokens/status-map";

/**
 * Rótulos em português para os enums do domínio. A UI nunca mostra o valor cru da Meta.
 * Onde o mapa do design system (@eco/tokens/status-map) cobre o enum, o rótulo vem de lá.
 * O resto é local até o chat UX & Design System incorporar (número, BM, saúde, severidade).
 */

export const QUALITY_LABEL: Record<QualityRating, string> = {
  GREEN: STATUS.quality.GREEN.label,
  YELLOW: STATUS.quality.YELLOW.label,
  RED: STATUS.quality.RED.label,
  UNKNOWN: "Sem avaliação", // não está no mapa do DS
};

export const NUMBER_STATUS_LABEL: Record<PhoneNumberStatus, string> = {
  CONNECTED: "Conectado",
  PENDING: "Pendente",
  FLAGGED: "Sinalizado pela Meta",
  RESTRICTED: "Envio restrito",
  RATE_LIMITED: "Vazão limitada",
  DISCONNECTED: "Desconectado",
  BANNED: "Banido",
  MIGRATED: "Migrado",
  UNVERIFIED: "Não verificado",
  DELETED: "Removido",
  UNKNOWN: "Desconhecido",
};

export const TENANT_STATUS_LABEL: Record<TenantStatus, string> = {
  trial: STATUS.tenant.trial.label,
  active: STATUS.tenant.active.label,
  past_due: STATUS.tenant.past_due.label,
  suspended: STATUS.tenant.suspended.label,
  // O domínio usa "churned" (encerrado, dados retidos pela LGPD); o DS chama de "canceled".
  churned: STATUS.tenant.canceled.label,
};

export const VERIFICATION_LABEL: Record<BusinessVerificationStatus, string> = {
  verified: "Verificada",
  pending: "Verificação em análise",
  not_verified: "Sem verificação",
  rejected: "Verificação recusada",
};

export const HEALTH_LABEL: Record<HealthStatus, string> = {
  operational: "Normal",
  degraded: "Degradado",
  down: "Fora do ar",
  maintenance: "Manutenção",
};

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "Crítico",
  serious: "Sério",
  warning: "Aviso",
};

export const TIER_LABEL: Record<MessagingLimitTier, string> = {
  TIER_250: "250",
  TIER_2K: "2 mil",
  TIER_10K: "10 mil",
  TIER_100K: "100 mil",
  TIER_UNLIMITED: "Ilimitado",
};
