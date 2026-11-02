/**
 * Ecossistema UI — mapa único de status → rótulo (pt-BR) + intenção + ícone.
 * Admin, Portal e Disparos importam daqui; nenhuma tela decide cor ou texto de status sozinha.
 *
 * Intenções (fixas, nunca a marca do tenant):
 *   success  · deu certo / saudável
 *   info     · em andamento, informativo
 *   warning  · pede atenção, ainda funciona
 *   serious  · funciona com perda ou vai parar se nada for feito (entre warning e danger)
 *   danger   · parado, recusado, bloqueado
 *   neutral  · sem juízo de valor (rascunho, desconectado por escolha, pulado)
 *
 * Chaves = valores reais do código: enums da Meta em CAIXA ALTA (iguais à Graph API) e
 * enums do @eco/core em inglês. Os domínios `contingency*` cobrem o schema v1 do Admin
 * (Prisma, valores em pt-BR) e somem quando ele migrar para os enums do @eco/core.
 */
export type Intent = "success" | "info" | "warning" | "serious" | "danger" | "neutral";

/** Ícones do vocabulário de status (equivalente lucide entre parênteses). */
export type StatusIcon =
  | "clock" // (clock)
  | "check" // (check)
  | "check-double" // (check-check)
  | "alert" // (triangle-alert)
  | "pause" // (pause)
  | "x" // (x)
  | "arrow-up" // (trending-up)
  | "lock" // (lock)
  | "unplug" // (unplug)
  | "help"; // (circle-help)

export type StatusDef = { label: string; intent: Intent; icon?: StatusIcon };

export const STATUS = {
  // ---------------------------------------------------------------- Meta / WhatsApp
  /** Template de mensagem (`status` da Graph API). */
  template: {
    APPROVED: { label: "Aprovado", intent: "success" },
    PENDING: { label: "Em análise", intent: "warning", icon: "clock" },
    IN_APPEAL: { label: "Em recurso", intent: "warning", icon: "clock" },
    REJECTED: { label: "Rejeitado", intent: "danger" },
    PAUSED: { label: "Pausado", intent: "serious", icon: "pause" },
    DISABLED: { label: "Desativado", intent: "danger", icon: "x" },
  },
  /** Qualidade do número ou do template (`quality_rating` / `quality_score`). */
  quality: {
    GREEN: { label: "Alta", intent: "success" },
    YELLOW: { label: "Média", intent: "warning" },
    RED: { label: "Baixa", intent: "danger" },
    UNKNOWN: { label: "Sem avaliação", intent: "neutral", icon: "help" },
  },
  /** Número de WhatsApp (`status` da Graph API). */
  phoneNumber: {
    CONNECTED: { label: "Conectado", intent: "success" },
    PENDING: { label: "Pendente", intent: "neutral", icon: "clock" },
    UNVERIFIED: { label: "Não verificado", intent: "warning" },
    FLAGGED: { label: "Sinalizado", intent: "warning", icon: "alert" },
    RATE_LIMITED: { label: "Vazão limitada", intent: "warning" },
    RESTRICTED: { label: "Envio restrito", intent: "serious", icon: "alert" },
    BANNED: { label: "Banido", intent: "danger", icon: "x" },
    DISCONNECTED: { label: "Desconectado", intent: "neutral", icon: "unplug" },
    MIGRATED: { label: "Migrado", intent: "neutral" },
    DELETED: { label: "Removido", intent: "neutral", icon: "x" },
    UNKNOWN: { label: "Desconhecido", intent: "neutral", icon: "help" },
  },
  /** Verificação de negócio do portfólio (BM). */
  bmVerification: {
    verified: { label: "Verificada", intent: "success", icon: "check" },
    pending: { label: "Verificação em análise", intent: "warning", icon: "clock" },
    not_verified: { label: "Sem verificação", intent: "neutral" },
    rejected: { label: "Verificação recusada", intent: "danger" },
  },
  /** Conexão da plataforma com o portfólio (token de System User). */
  bmConnection: {
    active: { label: "Conectada", intent: "success" },
    token_expiring: { label: "Token expirando", intent: "warning", icon: "clock" },
    token_invalid: { label: "Token inválido", intent: "danger" },
    revoked: { label: "Acesso revogado", intent: "danger", icon: "unplug" },
  },
  /** Situação da conta do portfólio na Meta (`BusinessAccountStatus`). */
  bmAccount: {
    active: { label: "Ativa", intent: "success" },
    restricted: { label: "Restrita", intent: "serious", icon: "alert" },
    banned: { label: "Banida", intent: "danger", icon: "x" },
  },
  /** Revisão da conta do WhatsApp Business (WABA). */
  wabaReview: {
    APPROVED: { label: "Aprovada", intent: "success" },
    PENDING: { label: "Em análise", intent: "warning", icon: "clock" },
    REJECTED: { label: "Recusada", intent: "danger" },
  },
  /** Nome de exibição do número. */
  displayName: {
    APPROVED: { label: "Nome aprovado", intent: "success" },
    PENDING_REVIEW: { label: "Nome em análise", intent: "warning", icon: "clock" },
    DECLINED: { label: "Nome recusado", intent: "danger" },
    NONE: { label: "Sem nome", intent: "neutral" },
  },
  /** Recibo da mensagem. Use o recibo (`Receipt`), não badge, em listas e no inbox. */
  message: {
    queued: { label: "Na fila", intent: "neutral", icon: "clock" },
    sent: { label: "Enviada", intent: "neutral", icon: "check" },
    delivered: { label: "Entregue", intent: "neutral", icon: "check-double" },
    read: { label: "Lida", intent: "info", icon: "check-double" },
    failed: { label: "Falhou", intent: "danger", icon: "alert" },
  },

  // ---------------------------------------------------------------- Plataforma
  tenant: {
    active: { label: "Ativo", intent: "success" },
    trial: { label: "Trial", intent: "info" },
    past_due: { label: "Inadimplente", intent: "warning" },
    suspended: { label: "Suspenso", intent: "danger", icon: "pause" },
    canceled: { label: "Cancelado", intent: "neutral" },
    /** Nome do @eco/core para `canceled` (encerrado, dados retidos pela LGPD). */
    churned: { label: "Cancelado", intent: "neutral" },
  },
  /** Cobrança do tenant (`BillingStatus`). */
  billing: {
    ok: { label: "Em dia", intent: "success" },
    overdue: { label: "Em atraso", intent: "warning", icon: "clock" },
    blocked: { label: "Bloqueada", intent: "danger", icon: "lock" },
  },
  /** Saúde de serviço (infra: webhooks, fila, Graph API, gateways). */
  health: {
    operational: { label: "Normal", intent: "success" },
    degraded: { label: "Degradado", intent: "serious", icon: "alert" },
    down: { label: "Fora do ar", intent: "danger", icon: "x" },
    maintenance: { label: "Manutenção", intent: "info", icon: "pause" },
  },
  /** Severidade de alerta. Ordem: critical > serious > warning. */
  alertSeverity: {
    critical: { label: "Crítico", intent: "danger", icon: "alert" },
    serious: { label: "Sério", intent: "serious", icon: "alert" },
    warning: { label: "Aviso", intent: "warning", icon: "alert" },
  },

  // ---------------------------------------------------------------- CRM
  /** Estágio comercial do contato. Eixo separado do consentimento. */
  leadStage: {
    new: { label: "Novo", intent: "neutral" },
    replied: { label: "Respondeu", intent: "info" },
    interested: { label: "Interessado", intent: "success" },
    invalid: { label: "Número inválido", intent: "neutral", icon: "x" },
  },
  /** Consentimento do contato. Opt-out vence qualquer estágio e bloqueia envio. */
  consent: {
    opted_in: { label: "Com consentimento", intent: "success", icon: "check" },
    unknown: { label: "Sem registro", intent: "neutral", icon: "help" },
    opted_out: { label: "Opt-out", intent: "danger", icon: "lock" },
  },
  /** Origem do último evento de consentimento (`ConsentSource` do @eco/core). Neutro: é procedência, não estado. */
  consentSource: {
    web_form: { label: "Formulário", intent: "neutral" },
    checkout: { label: "Checkout", intent: "neutral" },
    whatsapp_inbound: { label: "Contato iniciou a conversa", intent: "neutral" },
    whatsapp_keyword: { label: "Palavra-chave", intent: "neutral" },
    opt_out_button: { label: "Botão de descadastro", intent: "neutral" },
    import: { label: "Importação", intent: "neutral" },
    api: { label: "API", intent: "neutral" },
    support_request: { label: "Pedido à equipe", intent: "neutral" },
    admin: { label: "Operador", intent: "neutral" },
  },
  /** De onde veio o opt-out (nomes do módulo Disparos). Sem juízo de valor: todos neutros. */
  optOutSource: {
    keyword: { label: "Palavra-chave", intent: "neutral" },
    button: { label: "Botão de descadastro", intent: "neutral" },
    flow_node: { label: "Etapa do fluxo", intent: "neutral" },
    meta_marketing_optout: { label: "Parou no WhatsApp", intent: "neutral" },
    blocked: { label: "Bloqueio no WhatsApp", intent: "neutral" },
    manual: { label: "Pedido à equipe", intent: "neutral" },
    import: { label: "Importação", intent: "neutral" },
  },
  /** Conversa no atendimento (Portal). */
  conversation: {
    waiting: { label: "Aguardando", intent: "warning", icon: "clock" },
    in_service: { label: "Em atendimento", intent: "info" },
    waiting_customer: { label: "Aguardando contato", intent: "neutral" },
    closed: { label: "Encerrada", intent: "success", icon: "check" },
    blocked_optout: { label: "Bloqueada por opt-out", intent: "danger", icon: "lock" },
    window_closed: { label: "Janela 24h fechada", intent: "neutral", icon: "clock" },
    // Nomes da v1 do DS, mantidos por compatibilidade:
    open: { label: "Em atendimento", intent: "info" },
    unanswered: { label: "Aguardando", intent: "warning", icon: "clock" },
    resolved: { label: "Encerrada", intent: "success", icon: "check" },
  },

  // ---------------------------------------------------------------- Disparos & Fluxos
  campaign: {
    draft: { label: "Rascunho", intent: "neutral" },
    scheduled: { label: "Agendada", intent: "info", icon: "clock" },
    running: { label: "Em andamento", intent: "info" },
    paused: { label: "Pausada", intent: "warning", icon: "pause" },
    completed: { label: "Concluída", intent: "success", icon: "check" },
    canceled: { label: "Cancelada", intent: "neutral", icon: "x" },
    failed: { label: "Falhou", intent: "danger", icon: "alert" },
  },
  /** Destinatário de uma campanha. */
  recipient: {
    pending: { label: "Na fila", intent: "neutral", icon: "clock" },
    processing: { label: "Enviando", intent: "neutral", icon: "clock" },
    accepted: { label: "Aceita pela Meta", intent: "neutral", icon: "check" },
    sent: { label: "Enviada", intent: "neutral", icon: "check" },
    delivered: { label: "Entregue", intent: "neutral", icon: "check-double" },
    read: { label: "Lida", intent: "info", icon: "check-double" },
    failed: { label: "Falhou", intent: "danger", icon: "alert" },
    skipped_optout: { label: "Pulado: opt-out", intent: "neutral", icon: "lock" },
    skipped_invalid: { label: "Pulado: número inválido", intent: "neutral", icon: "x" },
  },
  /** Execução de um contato dentro do fluxo. */
  flowRun: {
    active: { label: "No fluxo", intent: "info" },
    waiting_delay: { label: "Aguardando tempo", intent: "neutral", icon: "clock" },
    waiting_reply: { label: "Aguardando resposta", intent: "neutral", icon: "clock" },
    completed: { label: "Concluído", intent: "success", icon: "check" },
    opted_out: { label: "Saiu por opt-out", intent: "neutral", icon: "lock" },
    failed: { label: "Falhou", intent: "danger", icon: "alert" },
    canceled: { label: "Cancelado", intent: "neutral", icon: "x" },
  },

  // ---------------------------------------------------------------- Contingência v1 (Admin, schema Prisma em pt-BR)
  /** Cliente (tabela `cliente` do schema v1). */
  contingencyClient: {
    ativo: { label: "Ativo", intent: "success" },
    trial: { label: "Trial", intent: "info" },
    inadimplente: { label: "Inadimplente", intent: "warning" },
    suspenso: { label: "Suspenso", intent: "danger", icon: "pause" },
    cancelado: { label: "Cancelado", intent: "neutral" },
  },
  /** Estado operacional da BM (doc 04 §4.2). */
  contingencyBm: {
    em_verificacao: { label: "Em verificação", intent: "neutral", icon: "clock" },
    escalonando: { label: "Escalonando", intent: "info", icon: "arrow-up" },
    ativa: { label: "Ativa", intent: "success" },
    restrita: { label: "Restrita", intent: "serious", icon: "alert" },
    banida: { label: "Banida", intent: "danger", icon: "x" },
  },
  contingencyBmVerification: {
    pendente: { label: "Verificação pendente", intent: "warning", icon: "clock" },
    verificada: { label: "Verificada", intent: "success", icon: "check" },
    recusada: { label: "Verificação recusada", intent: "danger" },
  },
  /** Estado operacional do número (doc 04 §4.2). */
  contingencyNumber: {
    pendente: { label: "Pendente", intent: "neutral", icon: "clock" },
    /** Rampa de volume interna (throttle nosso), não um estado da Meta. */
    aquecendo: { label: "Em rampa", intent: "info", icon: "arrow-up" },
    ativo: { label: "Ativo", intent: "success" },
    limitado: { label: "Limitado", intent: "warning", icon: "alert" },
    restrito: { label: "Envio restrito", intent: "serious", icon: "alert" },
    banido: { label: "Banido", intent: "danger", icon: "x" },
    desconectado: { label: "Desconectado", intent: "neutral", icon: "unplug" },
  },
  contingencyQuality: {
    alta: { label: "Alta", intent: "success" },
    media: { label: "Média", intent: "warning" },
    baixa: { label: "Baixa", intent: "danger" },
    sem_avaliacao: { label: "Sem avaliação", intent: "neutral", icon: "help" },
  },
  contingencyTemplate: {
    aprovado: { label: "Aprovado", intent: "success" },
    em_analise: { label: "Em análise", intent: "warning", icon: "clock" },
    rejeitado: { label: "Rejeitado", intent: "danger" },
    pausado: { label: "Pausado", intent: "serious", icon: "pause" },
    desativado: { label: "Desativado", intent: "danger", icon: "x" },
  },
  /** Disjuntor de envio por número (doc 04 §4.2). */
  circuitBreaker: {
    fechado: { label: "Enviando", intent: "success" },
    meio_aberto: { label: "Em teste", intent: "warning", icon: "clock" },
    aberto: { label: "Parado", intent: "serious", icon: "pause" },
  },
} as const satisfies Record<string, Record<string, StatusDef>>;

export type StatusDomain = keyof typeof STATUS;
export type StatusValue<D extends StatusDomain> = keyof (typeof STATUS)[D] & string;

/** Rótulo, intenção e ícone de um valor. Valor desconhecido cai em neutral com o valor cru. */
export function getStatus(domain: StatusDomain, value: string): StatusDef {
  const def = (STATUS[domain] as Record<string, StatusDef>)[value];
  return def ?? { label: value, intent: "neutral", icon: "help" };
}

/** "template.APPROVED" → { label, intent, icon }. */
export function resolveStatus(key: string): StatusDef {
  const dot = key.indexOf(".");
  const domain = key.slice(0, dot) as StatusDomain;
  const value = key.slice(dot + 1);
  if (dot < 0 || !(domain in STATUS)) return { label: key, intent: "neutral", icon: "help" };
  return getStatus(domain, value);
}

/** Opções de um domínio na ordem do mapa, para selects e filtros. Pula os nomes de compatibilidade. */
export function statusOptions<D extends StatusDomain>(domain: D): { value: StatusValue<D>; label: string }[] {
  const skip: Partial<Record<StatusDomain, string[]>> = {
    tenant: ["churned"],
    conversation: ["open", "unanswered", "resolved"],
  };
  return Object.entries(STATUS[domain] as Record<string, StatusDef>)
    .filter(([v]) => !skip[domain]?.includes(v))
    .map(([value, def]) => ({ value: value as StatusValue<D>, label: def.label }));
}
