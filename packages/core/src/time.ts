import type { ISODate } from "./domain";

/**
 * Fuso de operação. O Brasil não tem horário de verão desde 2019, então
 * America/Sao_Paulo é UTC-3 fixo. Se um dia houver tenants em outros fusos,
 * trocar estas funções por Intl.DateTimeFormat com o timeZone do tenant.
 */
export const OPERATING_TIMEZONE = "America/Sao_Paulo";
const OFFSET_MS = -3 * 60 * 60 * 1000;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Data local (YYYY-MM-DD) de um instante. */
export function localDate(at: Date): ISODate {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Hora local (0–23) de um instante. */
export function localHour(at: Date): number {
  return new Date(at.getTime() + OFFSET_MS).getUTCHours();
}

/** Dia da semana local (0 = domingo). */
export function localWeekday(at: Date): number {
  return new Date(at.getTime() + OFFSET_MS).getUTCDay();
}

/** Instante UTC da meia-noite local de uma data. */
export function startOfLocalDay(date: ISODate): Date {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() - OFFSET_MS);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Primeiro dia do mês local de um instante. */
export function startOfLocalMonth(at: Date): ISODate {
  return `${localDate(at).slice(0, 7)}-01`;
}

export function floorToHour(at: Date): Date {
  return new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS);
}
