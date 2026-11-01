import type { Cents, E164, ISODateTime, SoftDelete, Timestamps } from "./common";
import type { PlanId, TenantId, UserId } from "./ids";

/* ------------------------------------------------------------------ */
/* Planos                                                              */
/* ------------------------------------------------------------------ */

export interface PlanLimits {
  /** Mensagens de template (iniciadas pela empresa) por mês civil. */
  monthlyMessages: number;
  /** Números de WhatsApp conectados simultaneamente. */
  phoneNumbers: number;
  /** Usuários do portal do cliente. */
  seats: number;
  /** Contatos ativos na base (não anonimizados). */
  contacts: number;
}

export interface Plan extends Timestamps {
  id: PlanId;
  code: "start" | "growth" | "scale" | "enterprise";
  name: string;
  monthlyPriceCents: Cents;
  limits: PlanLimits;
  /** Plano descontinuado continua válido para quem já assina, mas não aparece na venda. */
  isPublic: boolean;
}

/* ------------------------------------------------------------------ */
/* Tenant (cliente da plataforma)                                      */
/* ------------------------------------------------------------------ */

export type TenantStatus =
  | "trial" // em teste, limites reduzidos
  | "active"
  | "past_due" // cobrança em atraso, ainda envia
  | "suspended" // envios bloqueados pelo admin ou por inadimplência
  | "churned"; // encerrado; dados retidos pelo prazo de LGPD e depois anonimizados

export type BillingStatus = "ok" | "overdue" | "blocked";

export interface TenantBranding {
  /** Nome exibido no portal white-label. */
  brandName: string;
  logoUrl: string | null;
  /** Cor principal do portal do cliente, em hex. */
  primaryColor: string;
  customDomain: string | null;
  customDomainStatus: "none" | "pending_dns" | "active" | "failed";
}

export interface TenantContact {
  name: string;
  email: string;
  phone: E164 | null;
}

export interface TenantCompliance {
  /** Encarregado de dados (DPO) do cliente, quando informado. */
  dpoEmail: string | null;
  /** Dias de retenção de mensagens antes da anonimização automática. */
  messageRetentionDays: number;
  /** Aceite dos termos de uso + política de mensagens (versão e data). */
  termsAcceptedVersion: string | null;
  termsAcceptedAt: ISODateTime | null;
}

export interface Tenant extends Timestamps, SoftDelete {
  id: TenantId;
  /** Usado em subdomínio do portal: {slug}.app.seudominio.com.br */
  slug: string;
  legalName: string;
  tradeName: string;
  documentType: "cnpj" | "cpf";
  /** Somente dígitos. */
  document: string;
  status: TenantStatus;
  planId: PlanId;
  /** Ajustes negociados por cliente; sobrescrevem o plano campo a campo. */
  limitsOverride: Partial<PlanLimits> | null;
  billingStatus: BillingStatus;
  nextInvoiceAt: ISODateTime | null;
  owner: TenantContact;
  branding: TenantBranding;
  compliance: TenantCompliance;
  /** Interruptor do admin: bloqueia qualquer envio do tenant imediatamente. */
  sendingEnabled: boolean;
  trialEndsAt: ISODateTime | null;
}

/* ------------------------------------------------------------------ */
/* Usuários e acesso                                                   */
/* ------------------------------------------------------------------ */

/** Papel na plataforma (painel admin). null = usuário só do portal do cliente. */
export type PlatformRole = "superadmin" | "support" | null;

/** Papel dentro de um tenant (portal do cliente). */
export type TenantRole = "owner" | "admin" | "operator" | "viewer";

export interface User extends Timestamps {
  id: UserId;
  email: string;
  name: string;
  platformRole: PlatformRole;
  lastSeenAt: ISODateTime | null;
  mfaEnabled: boolean;
}

export interface TenantMembership {
  tenantId: TenantId;
  userId: UserId;
  role: TenantRole;
  invitedAt: ISODateTime;
  acceptedAt: ISODateTime | null;
}

/** Limites efetivos = plano + override do tenant. */
export function effectiveLimits(plan: Plan, tenant: Pick<Tenant, "limitsOverride">): PlanLimits {
  return { ...plan.limits, ...(tenant.limitsOverride ?? {}) };
}
