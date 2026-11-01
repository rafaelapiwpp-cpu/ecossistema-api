/**
 * IDs com "marca" (branded types): o compilador impede passar um PhoneNumberId
 * onde se espera um TenantId, mesmo sendo os dois string em runtime.
 *
 * No banco: coluna text com prefixo + ULID/UUIDv7 (ordenável por tempo),
 * ex.: "tnt_01JBX9...". O prefixo facilita logs, suporte e URLs.
 */

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export const ID_PREFIX = {
  tenant: "tnt",
  plan: "pln",
  user: "usr",
  businessManager: "bm",
  waba: "waba",
  phoneNumber: "pn",
  template: "tpl",
  campaign: "cmp",
  contactList: "lst",
  lead: "lead",
  consentEvent: "cns",
  message: "msg",
  alert: "alr",
  auditLog: "aud",
} as const;

export type TenantId = Brand<string, "TenantId">;
export type PlanId = Brand<string, "PlanId">;
export type UserId = Brand<string, "UserId">;
export type BusinessManagerId = Brand<string, "BusinessManagerId">;
export type WabaId = Brand<string, "WabaId">;
export type PhoneNumberId = Brand<string, "PhoneNumberId">;
export type TemplateId = Brand<string, "TemplateId">;
export type CampaignId = Brand<string, "CampaignId">;
export type ContactListId = Brand<string, "ContactListId">;
export type LeadId = Brand<string, "LeadId">;
export type ConsentEventId = Brand<string, "ConsentEventId">;
export type MessageId = Brand<string, "MessageId">;
export type AlertId = Brand<string, "AlertId">;
export type AuditLogId = Brand<string, "AuditLogId">;

/** Converte uma string já validada em ID com marca. Use só na borda (banco, seed, parsing de rota). */
export const asId = <T extends Brand<string, string>>(value: string) => value as T;
