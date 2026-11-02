import { statusOptions } from "@eco/tokens/status-map";

/**
 * Opções da contingência (v1, persistência própria em pt-BR).
 * Rótulo, cor e ícone de cada estado vêm do status-map do design system
 * (domínios `contingency*`); aqui ficam só as listas para os selects.
 * Quando o @eco/core expuser o PostgresDataSource, os valores migram para os
 * enums do domínio (inglês/Meta) e as telas trocam o `domain` do StatusBadge.
 */

export const BM_STATUS = statusOptions("contingencyBm");
export const BM_VERIFICACAO = statusOptions("contingencyBmVerification");
export const NUMERO_STATUS = statusOptions("contingencyNumber");
export const QUALIDADE = statusOptions("contingencyQuality");
export const TEMPLATE_STATUS = statusOptions("contingencyTemplate");

export const NIVEL_LIMITE: { value: number; label: string }[] = [
  { value: 250, label: "250 / dia" },
  { value: 1000, label: "1 mil / dia" },
  { value: 10000, label: "10 mil / dia" },
  { value: 100000, label: "100 mil / dia" },
  { value: 0, label: "Ilimitado" },
];
export function nivelLabel(v: number): string {
  return NIVEL_LIMITE.find((n) => n.value === v)?.label ?? `${v} / dia`;
}

export const TEMPLATE_CATEGORIA: { value: string; label: string }[] = [
  { value: "marketing", label: "Marketing" },
  { value: "utilidade", label: "Utilidade" },
  { value: "autenticacao", label: "Autenticação" },
];
export const TEMPLATE_CATEGORIA_MAP: Record<string, string> = Object.fromEntries(TEMPLATE_CATEGORIA.map((c) => [c.value, c.label]));
