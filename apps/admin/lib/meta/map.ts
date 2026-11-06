/**
 * Tradução Meta → valores pt-BR que as telas de contingência gravam e mostram
 * (status-map, domínios contingency*). Funções puras, testadas em
 * lib/meta/tests/meta-sync.test.ts.
 *
 * Regra geral: a Meta é a fonte da verdade para o que ela mede (status,
 * qualidade, limite). Estados que são NOSSOS ("aquecendo" = rampa de volume,
 * "escalonando" = subindo de nível) são preservados quando a Meta diz que está
 * tudo normal.
 */
import type { MetaHealthEntity, MetaHealthStatus, MetaTemplateComponent } from "./graph";

export const QUALIDADE: Record<string, string> = {
  GREEN: "alta",
  YELLOW: "media",
  RED: "baixa",
  NA: "sem_avaliacao",
  UNKNOWN: "sem_avaliacao",
};
export const qualidade = (rating?: string) => QUALIDADE[rating ?? ""] ?? "sem_avaliacao";

const NUMERO_STATUS: Record<string, string> = {
  CONNECTED: "ativo",
  PENDING: "pendente",
  UNVERIFIED: "pendente",
  FLAGGED: "limitado",
  RATE_LIMITED: "limitado",
  RESTRICTED: "restrito",
  BANNED: "banido",
  DISCONNECTED: "desconectado",
  DELETED: "desconectado",
  MIGRATED: "desconectado",
};

/** Status do número. `atual` é o que está no banco (preserva a rampa interna). */
export function numeroStatus(meta: string | undefined, atual: string | null, podeEnviar?: string): string {
  let s = NUMERO_STATUS[meta ?? ""] ?? atual ?? "pendente";
  // A Meta diz "conectado", mas a saúde diz que nada sai: não é "ativo".
  if (s === "ativo" && podeEnviar === "BLOCKED") s = "restrito";
  if (s === "ativo" && podeEnviar === "LIMITED") s = "limitado";
  if (s === "ativo" && atual === "aquecendo") return "aquecendo";
  return s;
}

/** Tier de limite 24 h (portfólio) → número salvo em bm.nivelLimite (0 = ilimitado). */
export function nivelLimite(tier: string | undefined, atual: number): number {
  switch (tier) {
    case "TIER_50":
      return 50;
    case "TIER_250":
      return 250;
    case "TIER_1K":
      return 1000;
    case "TIER_2K":
      return 2000;
    case "TIER_10K":
      return 10000;
    case "TIER_100K":
      return 100000;
    case "TIER_UNLIMITED":
    case "UNLIMITED":
      return 0;
    default:
      return atual;
  }
}

export function verificacao(status: string | undefined, atual: string): string {
  switch ((status ?? "").toLowerCase()) {
    case "verified":
      return "verificada";
    case "rejected":
    case "failed":
      return "recusada";
    case "pending":
    case "pending_submission":
    case "pending_need_more_info":
    case "not_verified":
    case "revoked":
    case "expired":
      return "pendente";
    default:
      return atual;
  }
}

/**
 * Status operacional da BM a partir das WABAs. A Meta não tem um "BM banida"
 * explícito: o sinal é revisão rejeitada ou saúde BLOCKED.
 */
export function bmStatus(input: { atual: string; verificacao: string; wabas: { statusRevisao?: string | null; podeEnviar?: string | null }[] }): string {
  const { atual, wabas } = input;
  if (wabas.some((w) => w.statusRevisao === "REJECTED" || w.podeEnviar === "BLOCKED")) return "restrita";
  if (input.verificacao !== "verificada" && wabas.every((w) => w.statusRevisao !== "APPROVED")) return "em_verificacao";
  if (atual === "escalonando") return "escalonando";
  return "ativa";
}

const TEMPLATE_STATUS: Record<string, string> = {
  APPROVED: "aprovado",
  PENDING: "em_analise",
  IN_APPEAL: "em_analise",
  REJECTED: "rejeitado",
  PAUSED: "pausado",
  LIMIT_EXCEEDED: "pausado",
  DISABLED: "desativado",
  ARCHIVED: "desativado",
  DELETED: "desativado",
  PENDING_DELETION: "desativado",
};
export const templateStatus = (meta: string | undefined, atual = "em_analise") => TEMPLATE_STATUS[meta ?? ""] ?? atual;

const TEMPLATE_CATEGORIA: Record<string, string> = {
  MARKETING: "marketing",
  UTILITY: "utilidade",
  AUTHENTICATION: "autenticacao",
};
export const templateCategoria = (meta: string | undefined, atual = "marketing") => TEMPLATE_CATEGORIA[meta ?? ""] ?? atual;

export function templateCorpo(components: MetaTemplateComponent[] | undefined): string {
  return components?.find((c) => c.type === "BODY")?.text ?? "";
}

/** Só dígitos, para casar número cadastrado à mão com o da Meta. */
export const digits = (s: string) => s.replace(/\D/g, "");

/** Saúde da Meta → lista curta e legível (para a tela e para o campo `saude`). */
export function saudeResumo(h: MetaHealthStatus | undefined): { podeEnviar: string | null; problemas: { entidade: string; erro: string; solucao: string | null }[] } {
  const problemas = (h?.entities ?? [])
    .filter((e: MetaHealthEntity) => e.can_send_message && e.can_send_message !== "AVAILABLE")
    .flatMap((e) =>
      (e.errors?.length ? e.errors : [{}]).map((err) => ({
        entidade: e.entity_type ?? "?",
        erro: err.error_description ?? `Envio ${e.can_send_message === "BLOCKED" ? "bloqueado" : "limitado"}`,
        solucao: err.possible_solution ?? null,
      })),
    );
  return { podeEnviar: h?.can_send_message ?? null, problemas };
}
