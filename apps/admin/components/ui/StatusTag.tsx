import type { AlertSeverity, HealthStatus, QualityRating, TenantStatus } from "@eco/core";
import { HEALTH_LABEL, QUALITY_LABEL, SEVERITY_LABEL, TENANT_STATUS_LABEL } from "@/lib/labels";
import { Icon, type IconName } from "./Icon";
import styles from "./StatusTag.module.css";

/**
 * Estado é sempre ícone + rótulo, nunca só cor (legível para daltônicos e em impressão).
 */

export type Tone = "good" | "warning" | "serious" | "critical" | "neutral" | "muted";

export function StatusTag({ tone, icon, children, title }: { tone: Tone; icon: IconName; children: React.ReactNode; title?: string }) {
  return (
    <span className={`${styles.tag} ${styles[tone]}`} title={title}>
      <Icon name={icon} size={14} className={styles.icon} />
      <span>{children}</span>
    </span>
  );
}

const QUALITY: Record<QualityRating, { tone: Tone; icon: IconName }> = {
  GREEN: { tone: "good", icon: "operational" },
  YELLOW: { tone: "warning", icon: "warning" },
  RED: { tone: "critical", icon: "critical" },
  UNKNOWN: { tone: "muted", icon: "unknown" },
};

export function QualityTag({ quality }: { quality: QualityRating }) {
  const q = QUALITY[quality];
  return (
    <StatusTag tone={q.tone} icon={q.icon}>
      {QUALITY_LABEL[quality]}
    </StatusTag>
  );
}

const HEALTH: Record<HealthStatus, { tone: Tone; icon: IconName }> = {
  operational: { tone: "good", icon: "operational" },
  degraded: { tone: "serious", icon: "serious" },
  down: { tone: "critical", icon: "critical" },
  maintenance: { tone: "neutral", icon: "pause" },
};

export function HealthTag({ status }: { status: HealthStatus }) {
  const h = HEALTH[status];
  return (
    <StatusTag tone={h.tone} icon={h.icon}>
      {HEALTH_LABEL[status]}
    </StatusTag>
  );
}

export const SEVERITY_ICON: Record<AlertSeverity, IconName> = { critical: "critical", serious: "serious", warning: "warning" };

export function SeverityTag({ severity }: { severity: AlertSeverity }) {
  return (
    <StatusTag tone={severity} icon={SEVERITY_ICON[severity]}>
      {SEVERITY_LABEL[severity]}
    </StatusTag>
  );
}

const TENANT: Record<TenantStatus, { tone: Tone; icon: IconName }> = {
  active: { tone: "neutral", icon: "dot" },
  trial: { tone: "neutral", icon: "unknown" },
  past_due: { tone: "warning", icon: "warning" },
  suspended: { tone: "critical", icon: "pause" },
  churned: { tone: "muted", icon: "x" },
};

export function TenantStatusTag({ status }: { status: TenantStatus }) {
  const t = TENANT[status];
  return (
    <StatusTag tone={t.tone} icon={t.icon}>
      {TENANT_STATUS_LABEL[status]}
    </StatusTag>
  );
}
