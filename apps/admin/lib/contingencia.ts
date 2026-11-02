import type { Tone } from "@/components/ui/StatusTag";
import type { IconName } from "@/components/ui/Icon";

/**
 * Opções e rótulos da contingência (v1, persistência própria).
 * Estados seguem o doc 04. Quando o @eco/core expuser o PostgresDataSource,
 * estes valores migram para os enums do domínio (inglês/Meta).
 */

export interface Opcao {
  value: string;
  label: string;
  tone: Tone;
  icon: IconName;
}

const index = (opts: Opcao[]) => Object.fromEntries(opts.map((o) => [o.value, o])) as Record<string, Opcao>;

export const BM_STATUS: Opcao[] = [
  { value: "em_verificacao", label: "Em verificação", tone: "muted", icon: "unknown" },
  { value: "escalonando", label: "Escalonando", tone: "neutral", icon: "arrowUp" },
  { value: "ativa", label: "Ativa", tone: "good", icon: "operational" },
  { value: "restrita", label: "Restrita", tone: "warning", icon: "warning" },
  { value: "banida", label: "Banida", tone: "critical", icon: "critical" },
];
export const BM_STATUS_MAP = index(BM_STATUS);

export const BM_VERIFICACAO: Opcao[] = [
  { value: "pendente", label: "Verificação pendente", tone: "muted", icon: "unknown" },
  { value: "verificada", label: "Verificada", tone: "good", icon: "check" },
  { value: "recusada", label: "Verificação recusada", tone: "critical", icon: "x" },
];
export const BM_VERIFICACAO_MAP = index(BM_VERIFICACAO);

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

export const NUMERO_STATUS: Opcao[] = [
  { value: "pendente", label: "Pendente", tone: "muted", icon: "unknown" },
  { value: "aquecendo", label: "Aquecendo", tone: "neutral", icon: "arrowUp" },
  { value: "ativo", label: "Ativo", tone: "good", icon: "operational" },
  { value: "limitado", label: "Vazão limitada", tone: "warning", icon: "warning" },
  { value: "restrito", label: "Envio restrito", tone: "serious", icon: "serious" },
  { value: "banido", label: "Banido", tone: "critical", icon: "critical" },
  { value: "desconectado", label: "Desconectado", tone: "muted", icon: "disconnected" },
];
export const NUMERO_STATUS_MAP = index(NUMERO_STATUS);

export const QUALIDADE: Opcao[] = [
  { value: "alta", label: "Alta", tone: "good", icon: "operational" },
  { value: "media", label: "Média", tone: "warning", icon: "warning" },
  { value: "baixa", label: "Baixa", tone: "critical", icon: "critical" },
  { value: "sem_avaliacao", label: "Sem avaliação", tone: "muted", icon: "unknown" },
];
export const QUALIDADE_MAP = index(QUALIDADE);

export const TEMPLATE_CATEGORIA: { value: string; label: string }[] = [
  { value: "marketing", label: "Marketing" },
  { value: "utilidade", label: "Utilidade" },
  { value: "autenticacao", label: "Autenticação" },
];
export const TEMPLATE_CATEGORIA_MAP = Object.fromEntries(TEMPLATE_CATEGORIA.map((c) => [c.value, c.label]));

export const TEMPLATE_STATUS: Opcao[] = [
  { value: "aprovado", label: "Aprovado", tone: "good", icon: "operational" },
  { value: "em_analise", label: "Em análise", tone: "muted", icon: "unknown" },
  { value: "rejeitado", label: "Rejeitado", tone: "critical", icon: "critical" },
  { value: "pausado", label: "Pausado", tone: "warning", icon: "pause" },
  { value: "desativado", label: "Desativado", tone: "muted", icon: "x" },
];
export const TEMPLATE_STATUS_MAP = index(TEMPLATE_STATUS);
