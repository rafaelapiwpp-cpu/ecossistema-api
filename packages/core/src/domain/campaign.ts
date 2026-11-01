import type { ISODateTime, Timestamps } from "./common";
import type { CampaignId, ContactListId, PhoneNumberId, TemplateId, TenantId, UserId } from "./ids";

export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "canceled" | "failed";

/**
 * Pausas automáticas protegem a qualidade do número e da BM.
 * São freios, não contornos: a plataforma para de enviar quando a Meta ou o
 * público sinalizam problema.
 */
export type CampaignPauseReason =
  | "manual"
  | "quality_drop" // número caiu para YELLOW/RED durante o disparo
  | "limit_reached" // limite de 24 h da BM atingido
  | "opt_out_spike" // taxa de opt-out acima do teto configurado
  | "template_paused" // a Meta pausou o template
  | "tenant_suspended";

export interface CampaignAudience {
  listIds: ContactListId[];
  includeTags: string[];
  excludeTags: string[];
}

export interface CampaignThrottle {
  /** Teto de envios por minuto desta campanha (abaixo da vazão do número). */
  maxPerMinute: number;
  /** Janela de horário permitida, no fuso do tenant ("08:00"–"20:00"). */
  sendWindow: { start: string; end: string } | null;
}

export interface CampaignGuardrails {
  /** Pausa se opt-outs / entregues passar deste valor (0–1). */
  maxOptOutRate: number;
  /** Pausa se o número sair de GREEN durante o envio. */
  pauseOnQualityDrop: boolean;
}

/** Contadores agregados; a verdade está em `messages`, isto é um cache atualizado pelos workers. */
export interface CampaignStats {
  targeted: number;
  suppressedOptOut: number;
  suppressedNoConsent: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
  optOuts: number;
}

export interface Campaign extends Timestamps {
  id: CampaignId;
  tenantId: TenantId;
  name: string;
  templateId: TemplateId;
  phoneNumberId: PhoneNumberId;
  audience: CampaignAudience;
  /** Variável do template -> campo do lead. Ex.: { "1": "name", "2": "attributes.cidade" } */
  variableMapping: Record<string, string>;
  status: CampaignStatus;
  pauseReason: CampaignPauseReason | null;
  scheduledAt: ISODateTime | null;
  startedAt: ISODateTime | null;
  finishedAt: ISODateTime | null;
  throttle: CampaignThrottle;
  guardrails: CampaignGuardrails;
  stats: CampaignStats;
  createdBy: UserId;
}
