import type { ISODateTime, Timestamps } from "./common";
import type { TemplateId, TenantId, WabaId } from "./ids";
import type { QualityRating } from "./meta";

/** Categoria define o preço por mensagem e as regras de uso na Meta. */
export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | "IN_APPEAL";

export type TemplateHeader =
  | { type: "TEXT"; text: string }
  | { type: "IMAGE" | "VIDEO" | "DOCUMENT"; mediaHandle: string | null };

export type TemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  /** Botão de descadastro de marketing da Meta. O clique vira ConsentEvent(opt_out) automaticamente. */
  | { type: "MARKETING_OPT_OUT"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone: string }
  | { type: "COPY_CODE"; example: string };

export interface TemplateContent {
  header: TemplateHeader | null;
  /** Texto com variáveis posicionais {{1}}, {{2}}… */
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
}

export interface MessageTemplate extends Timestamps {
  id: TemplateId;
  tenantId: TenantId;
  wabaId: WabaId;
  /** null enquanto o rascunho não foi enviado para aprovação. */
  metaTemplateId: string | null;
  name: string;
  /** Código de idioma da Meta, ex.: "pt_BR". */
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  qualityScore: QualityRating;
  rejectionReason: string | null;
  content: TemplateContent;
  variableCount: number;
  statusChangedAt: ISODateTime;
}

/** Marketing sem botão de descadastro é bloqueado pela plataforma (regra nossa, não da Meta). */
export function requiresOptOutButton(t: Pick<MessageTemplate, "category">): boolean {
  return t.category === "MARKETING";
}
