import {
  asId,
  type BillingStatus,
  type BusinessAccountStatus,
  type BusinessManager,
  type BusinessVerificationStatus,
  type MessageTemplate,
  type MessagingLimitTier,
  type PhoneNumber,
  type PhoneNumberStatus,
  type QualityRating,
  type TemplateCategory,
  type TemplateStatus,
  type Tenant,
  type TenantId,
  type TenantStatus,
} from "../../domain";
import { PLAN_CODE_ALIASES } from "../plans";
import type { BmRow, ClienteRow, NumeroRow, TemplateRow } from "./rows";

/**
 * Tradução linha do banco (pt-BR, doc 04) → domínio (inglês / enums da Meta).
 *
 * É o ÚNICO lugar que conhece os dois vocabulários. Valor desconhecido cai no
 * estado mais conservador (nunca "tudo certo" por engano).
 */

/* ---------------- Vínculos ausentes ---------------- */

/** BM/número/template sem cliente ficam sob um tenant sintético, para não sumirem da tela. */
export const UNASSIGNED_TENANT_ID = asId<TenantId>("tnt_sem_cliente");
/** Prefixo da BM sintética que agrupa números sem BM vinculada (uma por tenant). */
export const UNASSIGNED_BM_PREFIX = "bm_sem_bm_";

export const isSyntheticBm = (id: string) => id.startsWith(UNASSIGNED_BM_PREFIX);

/* ---------------- Tabelas de equivalência ---------------- */

export const TENANT_STATUS: Record<string, TenantStatus> = {
  ativo: "active",
  trial: "trial",
  inadimplente: "past_due",
  suspenso: "suspended",
  cancelado: "churned",
};

export const BM_ACCOUNT_STATUS: Record<string, BusinessAccountStatus> = {
  em_verificacao: "active",
  escalonando: "active",
  ativa: "active",
  restrita: "restricted",
  banida: "banned",
};

export const BM_VERIFICATION: Record<string, BusinessVerificationStatus> = {
  pendente: "pending",
  verificada: "verified",
  recusada: "rejected",
};

/**
 * "aquecendo" é uma rampa de volume NOSSA (throttle), não um estado da Meta:
 * para o domínio o número está conectado. "limitado" é vazão reduzida.
 */
export const NUMBER_STATUS: Record<string, PhoneNumberStatus> = {
  pendente: "PENDING",
  aquecendo: "CONNECTED",
  ativo: "CONNECTED",
  limitado: "RATE_LIMITED",
  restrito: "RESTRICTED",
  banido: "BANNED",
  desconectado: "DISCONNECTED",
};

export const QUALITY: Record<string, QualityRating> = {
  alta: "GREEN",
  media: "YELLOW",
  baixa: "RED",
  sem_avaliacao: "UNKNOWN",
};

export const TEMPLATE_CATEGORY: Record<string, TemplateCategory> = {
  marketing: "MARKETING",
  utilidade: "UTILITY",
  autenticacao: "AUTHENTICATION",
};

export const TEMPLATE_STATUS: Record<string, TemplateStatus> = {
  aprovado: "APPROVED",
  em_analise: "PENDING",
  rejeitado: "REJECTED",
  pausado: "PAUSED",
  desativado: "DISABLED",
};

/** `nivelLimite` (destinatários/24 h) → tier da Meta. O tier de 1.000 do formulário corresponde ao TIER_2K da Meta. */
export function tierFromLimit(nivel: number): MessagingLimitTier {
  if (!nivel || nivel <= 0) return "TIER_UNLIMITED";
  if (nivel <= 250) return "TIER_250";
  if (nivel <= 2_000) return "TIER_2K";
  if (nivel <= 10_000) return "TIER_10K";
  if (nivel <= 100_000) return "TIER_100K";
  return "TIER_UNLIMITED";
}

/** Telefone digitado livremente → E.164. Números brasileiros sem DDI ganham +55. */
export function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

const iso = (d: Date) => d.toISOString();

/* ---------------- Entidades ---------------- */

export function toTenant(c: ClienteRow): Tenant {
  const status = TENANT_STATUS[c.status] ?? "suspended";
  const billing: BillingStatus = c.status === "inadimplente" ? "overdue" : "ok";
  return {
    id: asId(c.id),
    slug: c.slug,
    legalName: c.nome,
    tradeName: c.nome,
    documentType: "cnpj",
    document: "",
    status,
    planId: asId(`pln_${PLAN_CODE_ALIASES[c.plano] ?? "start"}`),
    limitsOverride: null,
    billingStatus: billing,
    nextInvoiceAt: null,
    owner: { name: c.nome, email: "", phone: null },
    branding: { brandName: c.nome, logoUrl: null, primaryColor: "#6C47EA", customDomain: null, customDomainStatus: "none" },
    compliance: { dpoEmail: null, messageRetentionDays: 365, termsAcceptedVersion: null, termsAcceptedAt: null },
    sendingEnabled: status === "active" || status === "trial" || status === "past_due",
    trialEndsAt: null,
    createdAt: iso(c.criadoEm),
    updatedAt: iso(c.atualizadoEm),
    deletedAt: null,
  };
}

export function unassignedTenant(now: Date): Tenant {
  return {
    ...toTenant({ id: UNASSIGNED_TENANT_ID, nome: "Sem cliente vinculado", slug: "sem-cliente", plano: "start", status: "ativo", notas: null, criadoEm: now, atualizadoEm: now }),
  };
}

export function toBusinessManager(b: BmRow): BusinessManager {
  const verification: BusinessVerificationStatus =
    BM_VERIFICATION[b.verificacao] ?? (b.status === "em_verificacao" ? "pending" : "not_verified");
  return {
    id: asId(b.id),
    tenantId: asId(b.clienteId ?? UNASSIGNED_TENANT_ID),
    metaBusinessId: b.metaBmId ?? "",
    name: b.nome,
    ownership: "client",
    verificationStatus: verification,
    messagingLimitTier: tierFromLimit(b.nivelLimite),
    connectionStatus: "active",
    accountStatus: BM_ACCOUNT_STATUS[b.status] ?? "restricted",
    tokenExpiresAt: null,
    lastSyncedAt: null,
    createdAt: iso(b.criadoEm),
    updatedAt: iso(b.atualizadoEm),
  };
}

/** BM sintética que agrupa os números sem BM de um tenant. */
export function syntheticBm(tenantId: string, now: Date): BusinessManager {
  return {
    id: asId(`${UNASSIGNED_BM_PREFIX}${tenantId}`),
    tenantId: asId(tenantId),
    metaBusinessId: "",
    name: "Sem BM vinculada",
    ownership: "client",
    verificationStatus: "not_verified",
    messagingLimitTier: "TIER_UNLIMITED",
    connectionStatus: "active",
    accountStatus: "active",
    tokenExpiresAt: null,
    lastSyncedAt: null,
    createdAt: iso(now),
    updatedAt: iso(now),
  };
}

export function toPhoneNumber(n: NumeroRow, ctx: { tenantId: string; bmId: string; verifiedName: string }): PhoneNumber {
  return {
    id: asId(n.id),
    tenantId: asId(ctx.tenantId),
    businessManagerId: asId(ctx.bmId),
    wabaId: asId(`waba_${ctx.bmId}`),
    metaPhoneNumberId: n.metaPhoneId ?? "",
    displayPhoneNumber: toE164(n.telefone),
    verifiedName: ctx.verifiedName,
    displayNameStatus: "NONE",
    qualityRating: QUALITY[n.qualidade] ?? "UNKNOWN",
    status: NUMBER_STATUS[n.status] ?? "UNKNOWN",
    throughput: "STANDARD",
    isOfficialBusinessAccount: false,
    label: null,
    sendingEnabled: true,
    qualityChangedAt: iso(n.atualizadoEm),
    lastHealthCheckAt: null,
    createdAt: iso(n.criadoEm),
    updatedAt: iso(n.atualizadoEm),
  };
}

export function toTemplate(t: TemplateRow): MessageTemplate {
  const vars = new Set([...t.corpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]));
  return {
    id: asId(t.id),
    tenantId: asId(t.clienteId ?? UNASSIGNED_TENANT_ID),
    wabaId: asId("waba_desconhecida"),
    metaTemplateId: null,
    name: t.nome,
    language: t.idioma,
    category: TEMPLATE_CATEGORY[t.categoria] ?? "MARKETING",
    status: TEMPLATE_STATUS[t.status] ?? "PENDING",
    qualityScore: "UNKNOWN",
    rejectionReason: null,
    content: { header: null, body: t.corpo, footer: null, buttons: [] },
    variableCount: vars.size,
    statusChangedAt: iso(t.atualizadoEm),
    createdAt: iso(t.criadoEm),
    updatedAt: iso(t.atualizadoEm),
  };
}
