/**
 * Ecossistema UI — mapa único de status → intenção + rótulo (pt-BR).
 * Admin e Portal importam daqui; nenhuma tela decide cor de status sozinha.
 */
export type Intent = "success" | "warning" | "danger" | "info" | "neutral";
export type StatusDef = { label: string; intent: Intent; icon?: "clock" | "check" | "check-double" | "alert" };

export const STATUS = {
  template: {
    APPROVED: { label: "Aprovado", intent: "success" },
    PENDING: { label: "Em análise", intent: "warning" },
    IN_APPEAL: { label: "Em análise", intent: "warning" },
    REJECTED: { label: "Rejeitado", intent: "danger" },
    PAUSED: { label: "Pausado", intent: "warning" },
    DISABLED: { label: "Desativado", intent: "neutral" },
  },
  quality: {
    GREEN: { label: "Alta", intent: "success" },
    YELLOW: { label: "Média", intent: "warning" },
    RED: { label: "Baixa", intent: "danger" },
  },
  message: {
    queued: { label: "Na fila", intent: "neutral", icon: "clock" },
    sent: { label: "Enviada", intent: "neutral", icon: "check" },
    delivered: { label: "Entregue", intent: "neutral", icon: "check-double" },
    read: { label: "Lida", intent: "info", icon: "check-double" },
    failed: { label: "Falhou", intent: "danger", icon: "alert" },
  },
  tenant: {
    active: { label: "Ativo", intent: "success" },
    trial: { label: "Trial", intent: "info" },
    past_due: { label: "Inadimplente", intent: "warning" },
    suspended: { label: "Suspenso", intent: "danger" },
    canceled: { label: "Cancelado", intent: "neutral" },
  },
  conversation: {
    open: { label: "Aberta", intent: "info" },
    unanswered: { label: "Sem resposta", intent: "warning" },
    waiting_customer: { label: "Aguardando cliente", intent: "neutral" },
    resolved: { label: "Resolvida", intent: "success" },
    window_closed: { label: "Janela 24h fechada", intent: "neutral", icon: "clock" },
  },
} as const satisfies Record<string, Record<string, StatusDef>>;

export type StatusDomain = keyof typeof STATUS;

/** "template.APPROVED" → { label, intent }. Valor desconhecido cai em neutral com o valor cru. */
export function resolveStatus(key: string): StatusDef {
  const [domain, value] = key.split(".") as [StatusDomain, string];
  const def = (STATUS[domain] as Record<string, StatusDef> | undefined)?.[value];
  return def ?? { label: value ?? key, intent: "neutral" };
}
