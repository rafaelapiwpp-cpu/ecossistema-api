import type { EntityRef, ISODateTime } from "./common";
import type { AlertId, AuditLogId, TenantId, UserId } from "./ids";

/* ------------------------------------------------------------------ */
/* Saúde da infraestrutura                                             */
/* ------------------------------------------------------------------ */

export type ServiceKey =
  | "api" // API HTTP do produto (admin + portal)
  | "dispatch_queue" // fila de disparo
  | "dispatch_workers" // workers que chamam a Cloud API
  | "meta_webhooks" // recepção e processamento de webhooks da Meta
  | "database"
  | "token_refresh" // renovação de tokens das BMs
  | "scheduler"; // agendador de campanhas

export type HealthStatus = "operational" | "degraded" | "down" | "maintenance";

export interface HealthSignal {
  label: string;
  value: number;
  unit: "ms" | "s" | "msg" | "msg/s" | "%" | "count";
}

export interface ServiceHealth {
  key: ServiceKey;
  name: string;
  status: HealthStatus;
  /** Sinal principal, exibido na lista. */
  primary: HealthSignal;
  /** O que está errado, quando não está operacional. */
  detail: string | null;
  checkedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Alertas                                                             */
/* ------------------------------------------------------------------ */

export type AlertSeverity = "critical" | "serious" | "warning";

export type AlertKind =
  | "number_quality_drop"
  | "number_flagged"
  | "number_restricted"
  | "number_disconnected"
  | "bm_verification_pending"
  | "bm_token_expiring"
  | "bm_limit_near"
  | "template_rejected"
  | "template_paused"
  | "quota_near_limit"
  | "opt_out_spike"
  | "billing_overdue"
  | "campaign_auto_paused"
  | "infra_degraded";

export type AlertSubjectType = "tenant" | "business_manager" | "phone_number" | "template" | "campaign" | "service";

export interface Alert {
  id: AlertId;
  /** null = alerta da plataforma (infra), não de um cliente. */
  tenantId: TenantId | null;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  subject: EntityRef<AlertSubjectType>;
  openedAt: ISODateTime;
  acknowledgedAt: ISODateTime | null;
  acknowledgedBy: UserId | null;
  resolvedAt: ISODateTime | null;
}

/** Ordem de prioridade para ordenar listas. */
export const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, serious: 1, warning: 2 };

/* ------------------------------------------------------------------ */
/* Auditoria                                                           */
/* ------------------------------------------------------------------ */

/** Toda ação do admin que muda estado de um cliente gera uma linha aqui (append-only). */
export interface AuditLogEntry {
  id: AuditLogId;
  actorUserId: UserId;
  tenantId: TenantId | null;
  action: string; // ex.: "tenant.suspend", "phone_number.disable_sending"
  target: EntityRef;
  metadata: Record<string, unknown>;
  occurredAt: ISODateTime;
  ip: string | null;
}
