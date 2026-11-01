/**
 * Tipos primitivos compartilhados por todo o domínio.
 *
 * Convenção de mapeamento para o Postgres:
 * - ISODateTime  -> timestamptz (sempre UTC na serialização)
 * - ISODate      -> date
 * - Cents/Micros -> bigint (nunca float para dinheiro)
 * - E164         -> text com CHECK (^\+[1-9]\d{7,14}$)
 */

/** Data e hora em ISO 8601 (UTC), ex.: "2026-10-31T23:00:00.000Z". */
export type ISODateTime = string;

/** Data de calendário "YYYY-MM-DD", no fuso do tenant quando indicado. */
export type ISODate = string;

/** Telefone no formato E.164, ex.: "+5551900001234". */
export type E164 = string;

/** Valor monetário em centavos (inteiro). */
export type Cents = number;

/** Valor monetário em milionésimos da moeda (inteiro). Usado no custo por mensagem, que tem frações de centavo. */
export type Micros = number;

export type CurrencyCode = "BRL" | "USD";

export interface Timestamps {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Exclusão lógica. Para LGPD, "excluir" um titular = anonimizar + marcar deletedAt. */
export interface SoftDelete {
  deletedAt: ISODateTime | null;
}

/** Referência polimórfica usada em alertas e auditoria. */
export interface EntityRef<T extends string = string> {
  type: T;
  id: string;
}
