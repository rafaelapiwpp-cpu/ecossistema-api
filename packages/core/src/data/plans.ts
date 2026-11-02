import type { Plan, PlanLimits } from "../domain";

/**
 * Catálogo de planos. Ainda não há tabela de planos no banco: mock e Postgres
 * usam este catálogo, e o `cliente.plano` do banco aponta para um `code` daqui.
 */
export const PLAN_SPECS: Array<Pick<Plan, "code" | "name" | "monthlyPriceCents" | "isPublic"> & { limits: PlanLimits }> = [
  { code: "start", name: "Start", monthlyPriceCents: 29_700, isPublic: true, limits: { monthlyMessages: 20_000, phoneNumbers: 1, seats: 3, contacts: 10_000 } },
  { code: "growth", name: "Growth", monthlyPriceCents: 79_700, isPublic: true, limits: { monthlyMessages: 100_000, phoneNumbers: 3, seats: 10, contacts: 60_000 } },
  { code: "scale", name: "Scale", monthlyPriceCents: 199_000, isPublic: true, limits: { monthlyMessages: 400_000, phoneNumbers: 10, seats: 30, contacts: 250_000 } },
  { code: "enterprise", name: "Enterprise", monthlyPriceCents: 490_000, isPublic: false, limits: { monthlyMessages: 1_500_000, phoneNumbers: 30, seats: 100, contacts: 1_000_000 } },
];

/** Código salvo em `cliente.plano` (pt-BR, telas de contingência) → plano do catálogo. */
export const PLAN_CODE_ALIASES: Record<string, Plan["code"]> = {
  starter: "start",
  start: "start",
  pro: "growth",
  growth: "growth",
  scale: "scale",
  enterprise: "enterprise",
};
