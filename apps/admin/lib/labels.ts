import type {
  AlertSeverity,
  BusinessVerificationStatus,
  HealthStatus,
  MessagingLimitTier,
  PhoneNumberStatus,
  QualityRating,
  TenantStatus,
} from "@eco/core";

/** Rótulos em português para os enums do domínio. A UI nunca mostra o valor cru da Meta. */

export const QUALITY_LABEL: Record<QualityRating, string> = {
  GREEN: "Alta",
  YELLOW: "Média",
  RED: "Baixa",
  UNKNOWN: "Sem avaliação",
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
  trial: "Em teste",
  active: "Ativo",
  past_due: "Inadimplente",
  suspended: "Suspenso",
  churned: "Encerrado",
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
