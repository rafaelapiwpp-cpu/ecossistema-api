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
 * Todos vêm do mapa do design system (@eco/tokens/status-map); só o tier de limite é local
 * (é uma quantidade, não um estado).
 */

const labels = <K extends string>(map: Record<K, { label: string }>) =>
  Object.fromEntries(Object.entries(map).map(([k, v]) => [k, (v as { label: string }).label])) as Record<K, string>;

export const QUALITY_LABEL: Record<QualityRating, string> = labels(STATUS.quality);
export const NUMBER_STATUS_LABEL: Record<PhoneNumberStatus, string> = labels(STATUS.phoneNumber);
export const TENANT_STATUS_LABEL: Record<TenantStatus, string> = labels(STATUS.tenant);
export const VERIFICATION_LABEL: Record<BusinessVerificationStatus, string> = labels(STATUS.bmVerification);
export const HEALTH_LABEL: Record<HealthStatus, string> = labels(STATUS.health);
export const SEVERITY_LABEL: Record<AlertSeverity, string> = labels(STATUS.alertSeverity);

export const TIER_LABEL: Record<MessagingLimitTier, string> = {
  TIER_250: "250",
  TIER_2K: "2 mil",
  TIER_10K: "10 mil",
  TIER_100K: "100 mil",
  TIER_UNLIMITED: "Ilimitado",
};
