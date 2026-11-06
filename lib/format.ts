export const fmtInt = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n || 0));
export const fmtMoney = (n: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2 }).format(n || 0);
export const fmtMoney4 = (n: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n || 0);
export const fmtPct = (n: number) => (isFinite(n) ? `${(n * 100).toFixed(1).replace(".", ",")}%` : "—");
export const fmtDay = (d: string) => { const [, m, dd] = d.split("-"); return `${dd}/${m}`; };
export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

export const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing", MARKETING_LITE: "Marketing Lite", UTILITY: "Utilidade",
  AUTHENTICATION: "Autenticação", AUTHENTICATION_INTERNATIONAL: "Autenticação intl.",
  SERVICE: "Atendimento", REFERRAL_CONVERSION: "Conversão (anúncio)", UNKNOWN: "Outros",
};
export const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Aprovado", PENDING: "Em análise", REJECTED: "Rejeitado", PAUSED: "Pausado",
  DISABLED: "Desativado", IN_APPEAL: "Em recurso", PENDING_DELETION: "Excluindo", DELETED: "Excluído",
  LIMIT_EXCEEDED: "Limite excedido", ARCHIVED: "Arquivado",
};
export const QUALITY_LABEL: Record<string, string> = { GREEN: "Alta", YELLOW: "Média", RED: "Baixa", UNKNOWN: "Sem nota" };
export const LIMIT_LABEL: Record<string, string> = {
  TIER_250: "250/dia", TIER_1K: "1 mil/dia", TIER_2K: "2 mil/dia", TIER_10K: "10 mil/dia",
  TIER_100K: "100 mil/dia", TIER_UNLIMITED: "Ilimitado",
};
