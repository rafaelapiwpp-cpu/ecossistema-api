/**
 * Motor de contingência (doc 04 §4): recebe SINAIS (webhook da Meta, consulta à
 * Graph API ou registro manual do operador) e devolve AÇÕES. Função pura: não
 * toca banco nem rede. Quem aplica as ações é o app (apps/admin/lib/contingencia-motor.ts).
 *
 * Princípio: a contingência PROTEGE a reputação (pausa, reduz, avisa). Ela nunca
 * troca de número/BM para continuar enviando o que a Meta ou os usuários rejeitaram,
 * e nunca retoma sozinha: retomar é manual, com motivo, por quem tem contingencia:operar.
 *
 * Fatos da Meta assumidos (out/2025 em diante):
 * - limite de iniciadas pela empresa é do PORTFÓLIO (BM): 250 → 2K → 10K → 100K → ilimitado;
 * - qualidade (GREEN/YELLOW/RED) é por número e por template; o webhook
 *   phone_number_quality_update NÃO traz a qualidade (só nível de limite), então a
 *   qualidade do número chega por consulta (GET /{phone_number_id}?fields=quality_rating).
 */

export type QualidadeMeta = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
export type TierMeta = "TIER_50" | "TIER_250" | "TIER_2K" | "TIER_10K" | "TIER_100K" | "TIER_UNLIMITED" | "TIER_NOT_SET";
export type EventoTemplateMeta = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | "IN_APPEAL" | "FLAGGED" | "REINSTATED" | "PENDING_DELETION";

/** Como o sinal aponta para as coisas. O app resolve para os ids do banco. */
export type RefNumero = { metaPhoneId?: string; telefone?: string; id?: string };
export type RefTemplate = { metaTemplateId?: string; nome?: string; idioma?: string; id?: string };
export type RefBm = { metaWabaId?: string; id?: string };

export type Sinal =
  | { tipo: "qualidade"; numero: RefNumero; para: QualidadeMeta; de?: QualidadeMeta }
  | { tipo: "erro"; numero: RefNumero; codigo: number; wamid?: string }
  | { tipo: "template_status"; template: RefTemplate; bm?: RefBm; evento: EventoTemplateMeta; motivo?: string }
  | { tipo: "template_qualidade"; template: RefTemplate; bm?: RefBm; para: QualidadeMeta; de?: QualidadeMeta }
  | { tipo: "conta"; bm: RefBm; evento: "DISABLE" | "SCHEDULE_FOR_DISABLE" | "REINSTATE" | "RESTRICTION" | "VIOLATION"; detalhe?: string }
  | { tipo: "limite"; bm: RefBm; tier: TierMeta }
  | { tipo: "taxas_campanha"; campanhaId: string; numero: RefNumero; bloqueio: number; optout: number };

export type Severidade = "info" | "aviso" | "critico";

export type Acao =
  | { tipo: "atualizar_qualidade_numero"; qualidade: QualidadeMeta }
  | { tipo: "abrir_disjuntor"; motivo: string }
  | { tipo: "pausar_campanhas_marketing"; motivo: string }
  | { tipo: "atualizar_status_template"; evento: EventoTemplateMeta }
  | { tipo: "atualizar_qualidade_template"; qualidade: QualidadeMeta }
  | { tipo: "pausar_campanhas_template"; motivo: string }
  | { tipo: "parar_bm"; status: "banida" | "restrita"; motivo: string }
  | { tipo: "reativar_status_bm" }
  | { tipo: "atualizar_limite_bm"; nivel: number }
  | { tipo: "pausar_campanha"; campanhaId: string; motivo: string }
  | { tipo: "alertar"; severidade: Severidade; texto: string };

/** Erros da Cloud API que interessam ao motor (statuses[].errors[].code do webhook `messages`). */
export const META_ERRORS: Record<number, { rotulo: string; acao: "contar" | "disjuntor_se_repetir" | "restringir" | "retry" | "ignorar_contato" }> = {
  130429: { rotulo: "Limite de vazão (mensagens por segundo) atingido", acao: "retry" },
  131048: { rotulo: "Limite de spam atingido no número", acao: "disjuntor_se_repetir" },
  131056: { rotulo: "Muitas mensagens para o mesmo contato em pouco tempo", acao: "contar" },
  131049: { rotulo: "Não entregue para preservar o engajamento (limite por usuário)", acao: "contar" },
  131026: { rotulo: "Mensagem não entregável", acao: "ignorar_contato" },
  131047: { rotulo: "Janela de 24h fechada", acao: "contar" },
  368: { rotulo: "Bloqueado temporariamente por violação de política", acao: "restringir" },
};

/** Campos de webhook que o app da Meta deve assinar para o motor funcionar. */
export const WEBHOOK_FIELDS = [
  "account_update",
  "phone_number_quality_update",
  "message_template_status_update",
  "message_template_quality_update",
  "messages",
] as const;

export type Thresholds = {
  /** bloqueios/denúncias por campanha (proxy interno), ex.: 0,02 = 2% */
  maxTaxaBloqueio: number;
  maxTaxaOptout: number;
  /** quantos 131048 na última hora abrem o disjuntor do número */
  maxErros131048PorHora: number;
};

export const THRESHOLDS_PADRAO: Thresholds = { maxTaxaBloqueio: 0.02, maxTaxaOptout: 0.03, maxErros131048PorHora: 5 };

export const NIVEL_POR_TIER: Record<TierMeta, number | null> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_2K: 2_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: 0, // 0 = ilimitado no schema do admin
  TIER_NOT_SET: null,
};

export type Contexto = {
  thresholds?: Thresholds;
  /** quantos erros com o mesmo código o número já teve na última hora (sem contar este) */
  errosMesmoCodigoUltimaHora?: number;
  /** qualidade atual gravada (para não repetir alerta quando nada mudou) */
  qualidadeAtual?: QualidadeMeta;
};

export type Avaliacao = { severidade: Severidade; texto: string; acoes: Acao[] };

const ROTULO_QUALIDADE: Record<QualidadeMeta, string> = { GREEN: "Alta", YELLOW: "Média", RED: "Baixa", UNKNOWN: "Sem avaliação" };

/** Regras automáticas. Toda avaliação vira um evento de contingência + auditoria no app. */
export function avaliar(s: Sinal, ctx: Contexto = {}): Avaliacao {
  const t = ctx.thresholds ?? THRESHOLDS_PADRAO;
  switch (s.tipo) {
    case "qualidade": {
      const base: Acao[] = [{ tipo: "atualizar_qualidade_numero", qualidade: s.para }];
      if (ctx.qualidadeAtual === s.para) return { severidade: "info", texto: `Qualidade do número segue ${ROTULO_QUALIDADE[s.para]}.`, acoes: base };
      if (s.para === "RED") {
        return {
          severidade: "critico",
          texto: "Qualidade caiu para Baixa: envio do número parado e campanhas de marketing pausadas. Revise público e conteúdo antes de retomar.",
          acoes: [...base, { tipo: "abrir_disjuntor", motivo: "Qualidade Baixa na Meta" }, { tipo: "pausar_campanhas_marketing", motivo: "Qualidade Baixa na Meta" }],
        };
      }
      if (s.para === "YELLOW") {
        return { severidade: "aviso", texto: "Qualidade Média: reduza volume e priorize contatos engajados.", acoes: [...base, { tipo: "alertar", severidade: "aviso", texto: "Qualidade Média" }] };
      }
      return { severidade: "info", texto: `Qualidade do número: ${ROTULO_QUALIDADE[s.para]}. Envio pausado não é retomado sozinho.`, acoes: base };
    }

    case "erro": {
      const e = META_ERRORS[s.codigo];
      if (!e) return { severidade: "info", texto: `Erro ${s.codigo} da Meta registrado.`, acoes: [] };
      if (e.acao === "restringir") {
        return {
          severidade: "critico",
          texto: `${e.rotulo} (erro ${s.codigo}). Envio do número parado; veja o motivo no Gerenciador do WhatsApp.`,
          acoes: [{ tipo: "abrir_disjuntor", motivo: `${e.rotulo} (${s.codigo})` }],
        };
      }
      if (e.acao === "disjuntor_se_repetir") {
        const total = (ctx.errosMesmoCodigoUltimaHora ?? 0) + 1;
        if (total >= t.maxErros131048PorHora) {
          return {
            severidade: "critico",
            texto: `${e.rotulo}: ${total} ocorrências na última hora. Envio do número parado.`,
            acoes: [{ tipo: "abrir_disjuntor", motivo: `${e.rotulo} (${total}x em 1 h)` }],
          };
        }
        return { severidade: "aviso", texto: `${e.rotulo} (${total} na última hora; para em ${t.maxErros131048PorHora}).`, acoes: [] };
      }
      return { severidade: "info", texto: `${e.rotulo} (erro ${s.codigo}).`, acoes: [] };
    }

    case "template_status": {
      const acoes: Acao[] = [{ tipo: "atualizar_status_template", evento: s.evento }];
      if (s.evento === "PAUSED" || s.evento === "DISABLED") {
        const r = s.evento === "PAUSED" ? "pausado" : "desativado";
        return {
          severidade: s.evento === "DISABLED" ? "critico" : "aviso",
          texto: `Template ${r} pela Meta${s.motivo ? ` (${s.motivo})` : ""}. Campanhas que o usam foram pausadas.`,
          acoes: [...acoes, { tipo: "pausar_campanhas_template", motivo: `Template ${r} pela Meta` }],
        };
      }
      if (s.evento === "REJECTED") return { severidade: "aviso", texto: `Template rejeitado${s.motivo ? `: ${s.motivo}` : ""}.`, acoes };
      return { severidade: "info", texto: `Template: ${s.evento}.`, acoes };
    }

    case "template_qualidade": {
      const acoes: Acao[] = [{ tipo: "atualizar_qualidade_template", qualidade: s.para }];
      if (s.para === "RED") return { severidade: "aviso", texto: "Qualidade do template caiu para Baixa; a Meta pode pausá-lo. Revise o conteúdo e o público.", acoes };
      return { severidade: "info", texto: `Qualidade do template: ${ROTULO_QUALIDADE[s.para]}.`, acoes };
    }

    case "conta": {
      if (s.evento === "DISABLE") {
        return {
          severidade: "critico",
          texto: "Conta banida pela Meta: todos os envios do portfólio parados. Caminho: revisão/recurso na Meta. Não migrar a operação para outra BM.",
          acoes: [{ tipo: "parar_bm", status: "banida", motivo: "Conta banida pela Meta" }],
        };
      }
      if (s.evento === "RESTRICTION") {
        return {
          severidade: "critico",
          texto: `Conta restrita pela Meta${s.detalhe ? ` (${s.detalhe})` : ""}: envios do portfólio parados.`,
          acoes: [{ tipo: "parar_bm", status: "restrita", motivo: "Conta restrita pela Meta" }],
        };
      }
      if (s.evento === "SCHEDULE_FOR_DISABLE") {
        return { severidade: "critico", texto: "A Meta agendou a desativação da conta. Revise as violações e recorra antes da data.", acoes: [{ tipo: "alertar", severidade: "critico", texto: "Desativação agendada" }] };
      }
      if (s.evento === "VIOLATION") {
        return { severidade: "aviso", texto: `Violação de política registrada pela Meta${s.detalhe ? `: ${s.detalhe}` : ""}.`, acoes: [{ tipo: "alertar", severidade: "aviso", texto: "Violação de política" }] };
      }
      return {
        severidade: "info",
        texto: "Conta restabelecida pela Meta. Os números continuam parados até alguém retomar manualmente.",
        acoes: [{ tipo: "reativar_status_bm" }],
      };
    }

    case "limite": {
      const nivel = NIVEL_POR_TIER[s.tier];
      if (nivel === null) return { severidade: "info", texto: "Portfólio ainda sem nível de limite definido.", acoes: [] };
      return { severidade: "info", texto: `Limite do portfólio: ${nivel === 0 ? "ilimitado" : `${nivel.toLocaleString("pt-BR")} contatos/24h`}.`, acoes: [{ tipo: "atualizar_limite_bm", nivel }] };
    }

    case "taxas_campanha": {
      if (s.bloqueio > t.maxTaxaBloqueio || s.optout > t.maxTaxaOptout) {
        const motivo = `Bloqueio ${(s.bloqueio * 100).toFixed(1)}% / opt-out ${(s.optout * 100).toFixed(1)}% acima do limite`;
        return { severidade: "aviso", texto: `${motivo}: campanha pausada.`, acoes: [{ tipo: "pausar_campanha", campanhaId: s.campanhaId, motivo }] };
      }
      return { severidade: "info", texto: "Taxas da campanha dentro do limite.", acoes: [] };
    }
  }
}

/**
 * Rampa interna de volume de um número novo (throttle da plataforma, não um estado da Meta):
 * cresce só se a qualidade se mantém e nunca passa do limite do portfólio.
 */
export function tetoRampa(dia: number, limitePortfolio: number, qualidade: QualidadeMeta): number {
  const curva = [50, 100, 200, 400, 800, 1500, 3000];
  if (qualidade === "RED") return 0;
  const base = curva[Math.min(Math.max(dia, 0), curva.length - 1)] ?? 0;
  const fator = qualidade === "YELLOW" ? 0.5 : 1;
  const teto = Math.floor(base * fator);
  return limitePortfolio > 0 ? Math.min(teto, limitePortfolio) : teto;
}

/**
 * Roteamento legítimo entre números do MESMO cliente e da MESMA BM (doc 04 §4.4):
 * contato já atendido fica no mesmo número (sticky); se esse número estiver ruim, espera.
 * Não distribui entre BMs: o limite é do portfólio e somar BMs contraria os termos da Meta.
 */
export type NumeroRoteavel = { id: string; bmId: string; status: string; qualidade: QualidadeMeta; disjuntor: "fechado" | "aberto" | "meio_aberto"; enviadosHoje: number; tetoDiario: number };

export function escolherNumero(numeroFixo: string | null, candidatos: NumeroRoteavel[]): string | null {
  const ok = candidatos.filter(
    (n) => (n.status === "ativo" || n.status === "aquecendo") && n.qualidade !== "RED" && n.disjuntor === "fechado" && n.enviadosHoje < n.tetoDiario,
  );
  if (new Set(candidatos.map((n) => n.bmId)).size > 1) throw new Error("candidatos de BMs diferentes");
  if (numeroFixo) return ok.some((n) => n.id === numeroFixo) ? numeroFixo : null;
  return ok.sort((a, b) => b.tetoDiario - b.enviadosHoje - (a.tetoDiario - a.enviadosHoje))[0]?.id ?? null;
}
