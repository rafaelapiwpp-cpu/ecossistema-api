import type {
  BillingStatus,
  BusinessConnectionStatus,
  BusinessManagerOwnership,
  BusinessVerificationStatus,
  CampaignPauseReason,
  CampaignStatus,
  DisplayNameStatus,
  MessagingLimitTier,
  Plan,
  PlanLimits,
  PhoneNumberStatus,
  QualityRating,
  TemplateCategory,
  TemplateStatus,
  TenantStatus,
  ThroughputLevel,
} from "../../domain";

/**
 * O "mundo" simulado: 12 clientes fictícios com situações escolhidas para
 * exercitar cada estado que o painel precisa saber exibir (número com
 * qualidade baixa, BM sem verificação, token expirando, cota no fim,
 * pico de opt-out, cliente suspenso, inadimplente, em teste…).
 *
 * Telefones usam o padrão 9 0000-XXXX para ficarem obviamente fictícios.
 * Domínios usam o TLD reservado .example.
 */

/** Instante de referência do mock: 31/10/2026 23:00 em São Paulo. */
export const MOCK_NOW = new Date("2026-11-01T02:00:00.000Z");

/** Quantos dias de histórico horário o mock gera (cobre o mês corrente inteiro). */
export const MOCK_HISTORY_DAYS = 35;

export { PLAN_SPECS } from "../plans";

export interface NumberSpec {
  suffix: string;
  label: string | null;
  quality: QualityRating;
  status: PhoneNumberStatus;
  /** Fração do volume diário do tenant que passa por este número. */
  share: number;
  throughput?: ThroughputLevel;
  displayNameStatus?: DisplayNameStatus;
  qualityChangedDaysAgo?: number;
  /** Taxa de entrega (0–1). Números com qualidade baixa entregam menos. */
  deliveryRate?: number;
  sendingEnabled?: boolean;
}

export interface BmSpec {
  name: string;
  ownership: BusinessManagerOwnership;
  verification: BusinessVerificationStatus;
  tier: MessagingLimitTier;
  connection?: BusinessConnectionStatus;
  tokenExpiresInDays?: number | null;
  numbers: NumberSpec[];
}

export interface TemplateSpec {
  name: string;
  category: TemplateCategory;
  status: TemplateStatus;
  quality?: QualityRating;
  rejectionReason?: string;
  statusChangedDaysAgo?: number;
  body: string;
}

export interface CampaignSpec {
  name: string;
  template: string;
  /** Índice do número dentro do tenant (ordem das BMs e números). */
  numberIndex: number;
  status: CampaignStatus;
  pauseReason?: CampaignPauseReason;
  targeted: number;
  /** Para running/paused/completed: há quantas horas começou. Para scheduled: daqui a quantas horas. */
  hours: number;
}

export interface TenantSpec {
  slug: string;
  tradeName: string;
  legalName: string;
  document: string;
  ddd: string;
  plan: Plan["code"];
  limitsOverride?: Partial<PlanLimits>;
  status: TenantStatus;
  billing: BillingStatus;
  createdDaysAgo: number;
  /** Para suspensos: há quantos dias os envios pararam. */
  stoppedDaysAgo?: number;
  /** Volume diário médio em dia útil (mensagens enviadas). */
  dailyVolume: number;
  readRate: number;
  /** Opt-outs por mensagem entregue. */
  optOutRate: number;
  /** Sobrescreve a taxa de opt-out nas últimas 24 h (para simular pico). */
  optOutRateLast24h?: number;
  /** Multiplicador de volume nas últimas N horas (ex.: campanha pausada). */
  recentVolume?: { hours: number; factor: number };
  contacts: number;
  optedOutPct: number;
  brand: { color: string; customDomain: string | null; customDomainStatus: "none" | "pending_dns" | "active" | "failed" };
  owner: { name: string; email: string };
  bms: BmSpec[];
  templates: TemplateSpec[];
  campaigns: CampaignSpec[];
}

const OPT_OUT_FOOTER = "Para não receber mais, toque em Parar.";

export const TENANT_SPECS: TenantSpec[] = [
  {
    slug: "farmavida",
    tradeName: "Rede Farmavida",
    legalName: "Farmavida Comércio de Medicamentos Ltda.",
    document: "40112233000140",
    ddd: "51",
    plan: "enterprise",
    limitsOverride: { monthlyMessages: 640_000 },
    status: "active",
    billing: "ok",
    createdDaysAgo: 412,
    dailyVolume: 19_500,
    readRate: 0.74,
    optOutRate: 0.0021,
    contacts: 184_300,
    optedOutPct: 0.041,
    brand: { color: "#1f8a5b", customDomain: "portal.farmavida.example", customDomainStatus: "active" },
    owner: { name: "Marina Toledo", email: "marina@farmavida.example" },
    bms: [
      {
        name: "Farmavida Matriz",
        ownership: "client",
        verification: "verified",
        tier: "TIER_100K",
        numbers: [
          { suffix: "1001", label: "Receitas", quality: "GREEN", status: "CONNECTED", share: 0.28, throughput: "HIGH" },
          { suffix: "1002", label: "Ofertas", quality: "GREEN", status: "CONNECTED", share: 0.24, throughput: "HIGH" },
          { suffix: "1003", label: "Entregas", quality: "GREEN", status: "CONNECTED", share: 0.18 },
          { suffix: "1004", label: "Fidelidade", quality: "GREEN", status: "CONNECTED", share: 0.12 },
        ],
      },
      {
        name: "Farmavida Serra",
        ownership: "client",
        verification: "verified",
        tier: "TIER_10K",
        numbers: [
          { suffix: "1005", label: "Lojas Serra", quality: "GREEN", status: "CONNECTED", share: 0.11 },
          { suffix: "1006", label: "Manipulação", quality: "GREEN", status: "CONNECTED", share: 0.07 },
        ],
      },
    ],
    templates: [
      { name: "receita_pronta", category: "UTILITY", status: "APPROVED", body: "Olá, {{1}}! Sua receita está pronta para retirada na loja {{2}}." },
      { name: "pedido_saiu", category: "UTILITY", status: "APPROVED", body: "{{1}}, seu pedido {{2}} saiu para entrega." },
      { name: "ofertas_semana", category: "MARKETING", status: "APPROVED", body: "{{1}}, as ofertas da semana chegaram. Confira no app." },
      { name: "codigo_acesso", category: "AUTHENTICATION", status: "APPROVED", body: "Seu código de acesso é {{1}}." },
    ],
    campaigns: [
      { name: "Ofertas de sábado — RS", template: "ofertas_semana", numberIndex: 1, status: "running", targeted: 42_000, hours: 9 },
      { name: "Receitas prontas (automático)", template: "receita_pronta", numberIndex: 0, status: "running", targeted: 8_400, hours: 20 },
      { name: "Ofertas de novembro", template: "ofertas_semana", numberIndex: 1, status: "scheduled", targeted: 61_000, hours: 34 },
      { name: "Ofertas de outubro — semana 4", template: "ofertas_semana", numberIndex: 1, status: "completed", targeted: 58_200, hours: 80 },
    ],
  },
  {
    slug: "agrosul",
    tradeName: "Cooperativa Agro Sul",
    legalName: "Cooperativa Agroindustrial Agro Sul",
    document: "40223344000151",
    ddd: "54",
    plan: "enterprise",
    status: "active",
    billing: "ok",
    createdDaysAgo: 530,
    dailyVolume: 27_000,
    readRate: 0.81,
    optOutRate: 0.0012,
    contacts: 96_800,
    optedOutPct: 0.018,
    brand: { color: "#5a7d2a", customDomain: "whats.agrosul.example", customDomainStatus: "active" },
    owner: { name: "Jorge Bettiol", email: "jorge.bettiol@agrosul.example" },
    bms: [
      {
        name: "Agro Sul Cooperados",
        ownership: "client",
        verification: "verified",
        tier: "TIER_UNLIMITED",
        numbers: [
          { suffix: "2001", label: "Cotações", quality: "GREEN", status: "CONNECTED", share: 0.3, throughput: "HIGH" },
          { suffix: "2002", label: "Assistência técnica", quality: "GREEN", status: "CONNECTED", share: 0.16 },
          { suffix: "2003", label: "Recebimento de grãos", quality: "GREEN", status: "CONNECTED", share: 0.14 },
        ],
      },
      {
        name: "Agro Sul Lojas",
        ownership: "client",
        verification: "verified",
        tier: "TIER_100K",
        numbers: [
          { suffix: "2004", label: "Lojas agropecuárias", quality: "GREEN", status: "CONNECTED", share: 0.15 },
          { suffix: "2005", label: "Crédito", quality: "GREEN", status: "CONNECTED", share: 0.08 },
          { suffix: "2006", label: "Eventos", quality: "YELLOW", status: "CONNECTED", share: 0.07, qualityChangedDaysAgo: 3, deliveryRate: 0.93 },
        ],
      },
      {
        name: "Agro Sul Supermercados",
        ownership: "client",
        verification: "verified",
        tier: "TIER_10K",
        numbers: [
          { suffix: "2007", label: "Supermercado", quality: "GREEN", status: "CONNECTED", share: 0.1 },
          { suffix: "2008", label: "Encomendas", quality: "UNKNOWN", status: "DISCONNECTED", share: 0.04, sendingEnabled: false, qualityChangedDaysAgo: 1 },
        ],
      },
    ],
    templates: [
      { name: "cotacao_diaria", category: "UTILITY", status: "APPROVED", body: "Cotação de hoje, {{1}}: soja {{2}}, milho {{3}}." },
      { name: "visita_tecnica", category: "UTILITY", status: "APPROVED", body: "{{1}}, a visita técnica está confirmada para {{2}}." },
      { name: "dia_de_campo", category: "MARKETING", status: "APPROVED", quality: "YELLOW", body: "Você está convidado para o Dia de Campo {{1}}." },
      { name: "credito_safra", category: "MARKETING", status: "PENDING", statusChangedDaysAgo: 0, body: "{{1}}, sua pré-aprovação de crédito safra está disponível." },
    ],
    campaigns: [
      { name: "Cotação diária — cooperados", template: "cotacao_diaria", numberIndex: 0, status: "running", targeted: 31_500, hours: 15 },
      { name: "Convite Dia de Campo", template: "dia_de_campo", numberIndex: 5, status: "running", targeted: 12_000, hours: 6 },
      { name: "Crédito safra 26/27", template: "credito_safra", numberIndex: 4, status: "draft", targeted: 0, hours: 0 },
    ],
  },
  {
    slug: "bemvestir",
    tradeName: "Bem Vestir Moda",
    legalName: "Bem Vestir Confecções e Varejo Ltda.",
    document: "40334455000162",
    ddd: "11",
    plan: "scale",
    status: "active",
    billing: "ok",
    createdDaysAgo: 220,
    dailyVolume: 10_800,
    readRate: 0.63,
    optOutRate: 0.0042,
    optOutRateLast24h: 0.0215,
    contacts: 141_200,
    optedOutPct: 0.083,
    brand: { color: "#b03a62", customDomain: null, customDomainStatus: "none" },
    owner: { name: "Paula Siqueira", email: "paula@bemvestir.example" },
    bms: [
      {
        name: "Bem Vestir E-commerce",
        ownership: "client",
        verification: "verified",
        tier: "TIER_10K",
        numbers: [
          { suffix: "3001", label: "Loja online", quality: "GREEN", status: "CONNECTED", share: 0.34 },
          { suffix: "3002", label: "Pós-venda", quality: "GREEN", status: "CONNECTED", share: 0.18 },
          { suffix: "3003", label: "Campanhas", quality: "YELLOW", status: "CONNECTED", share: 0.2, qualityChangedDaysAgo: 0.6, deliveryRate: 0.94 },
        ],
      },
      {
        name: "Bem Vestir Lojas",
        ownership: "client",
        verification: "verified",
        tier: "TIER_10K",
        numbers: [
          { suffix: "3004", label: "Lojas físicas", quality: "GREEN", status: "CONNECTED", share: 0.16 },
          { suffix: "3005", label: "Clube", quality: "GREEN", status: "CONNECTED", share: 0.12 },
        ],
      },
    ],
    templates: [
      { name: "pedido_confirmado", category: "UTILITY", status: "APPROVED", body: "{{1}}, recebemos seu pedido {{2}}." },
      { name: "carrinho_esquecido", category: "MARKETING", status: "APPROVED", body: "{{1}}, os itens do seu carrinho ainda estão separados." },
      { name: "esquenta_black", category: "MARKETING", status: "APPROVED", quality: "YELLOW", body: "{{1}}, o esquenta Black Friday começou." },
      {
        name: "black_friday_2026",
        category: "MARKETING",
        status: "REJECTED",
        rejectionReason: "Variável no início do texto sem conteúdo de exemplo.",
        statusChangedDaysAgo: 1,
        body: "{{1}} {{2}}% de desconto em tudo.",
      },
    ],
    campaigns: [
      { name: "Esquenta Black Friday", template: "esquenta_black", numberIndex: 2, status: "running", targeted: 38_000, hours: 11 },
      { name: "Carrinho esquecido (automático)", template: "carrinho_esquecido", numberIndex: 0, status: "running", targeted: 2_900, hours: 22 },
      { name: "Black Friday — abertura", template: "black_friday_2026", numberIndex: 2, status: "draft", targeted: 0, hours: 0 },
    ],
  },
  {
    slug: "sabordaserra",
    tradeName: "Sabor da Serra Delivery",
    legalName: "Sabor da Serra Alimentos Ltda.",
    document: "40445566000173",
    ddd: "54",
    plan: "scale",
    status: "active",
    billing: "ok",
    createdDaysAgo: 160,
    dailyVolume: 8_600,
    readRate: 0.77,
    optOutRate: 0.0018,
    contacts: 52_400,
    optedOutPct: 0.036,
    brand: { color: "#c25a1c", customDomain: "pedidos.sabordaserra.example", customDomainStatus: "pending_dns" },
    owner: { name: "Diego Ronchi", email: "diego@sabordaserra.example" },
    bms: [
      {
        name: "Sabor da Serra",
        ownership: "client",
        verification: "verified",
        tier: "TIER_10K",
        connection: "token_expiring",
        tokenExpiresInDays: 3,
        numbers: [
          { suffix: "4001", label: "Pedidos Caxias", quality: "GREEN", status: "CONNECTED", share: 0.42 },
          { suffix: "4002", label: "Pedidos Gramado", quality: "GREEN", status: "CONNECTED", share: 0.3 },
          { suffix: "4003", label: "Promoções", quality: "GREEN", status: "CONNECTED", share: 0.2 },
        ],
      },
      {
        name: "Sabor da Serra (operado pela plataforma)",
        ownership: "platform",
        verification: "verified",
        tier: "TIER_2K",
        numbers: [{ suffix: "4004", label: "Franquias", quality: "GREEN", status: "CONNECTED", share: 0.08 }],
      },
    ],
    templates: [
      { name: "pedido_a_caminho", category: "UTILITY", status: "APPROVED", body: "{{1}}, seu pedido está a caminho. Previsão: {{2}}." },
      { name: "cupom_fim_de_semana", category: "MARKETING", status: "APPROVED", body: "{{1}}, cupom de fim de semana: {{2}}." },
    ],
    campaigns: [
      { name: "Cupom de sábado", template: "cupom_fim_de_semana", numberIndex: 2, status: "running", targeted: 18_000, hours: 5 },
      { name: "Cupom de domingo", template: "cupom_fim_de_semana", numberIndex: 2, status: "scheduled", targeted: 18_400, hours: 13 },
    ],
  },
  {
    slug: "horizonte",
    tradeName: "Escola Técnica Horizonte",
    legalName: "Instituto Horizonte de Educação Profissional",
    document: "40556677000184",
    ddd: "41",
    plan: "growth",
    status: "active",
    billing: "ok",
    createdDaysAgo: 300,
    dailyVolume: 2_500,
    readRate: 0.84,
    optOutRate: 0.0008,
    contacts: 23_900,
    optedOutPct: 0.012,
    brand: { color: "#2d5fa8", customDomain: "avisos.horizonte.example", customDomainStatus: "active" },
    owner: { name: "Renata Kowalski", email: "renata@horizonte.example" },
    bms: [
      {
        name: "Escola Horizonte",
        ownership: "client",
        verification: "verified",
        tier: "TIER_10K",
        numbers: [
          { suffix: "5001", label: "Secretaria", quality: "GREEN", status: "CONNECTED", share: 0.62 },
          { suffix: "5002", label: "Matrículas", quality: "GREEN", status: "CONNECTED", share: 0.38 },
        ],
      },
    ],
    templates: [
      { name: "aviso_aula", category: "UTILITY", status: "APPROVED", body: "{{1}}, a aula de {{2}} foi remarcada para {{3}}." },
      { name: "matriculas_abertas", category: "MARKETING", status: "APPROVED", body: "{{1}}, as matrículas para 2027 estão abertas." },
    ],
    campaigns: [
      { name: "Matrículas 2027 — ex-alunos", template: "matriculas_abertas", numberIndex: 1, status: "completed", targeted: 9_800, hours: 50 },
      { name: "Matrículas 2027 — interessados", template: "matriculas_abertas", numberIndex: 1, status: "scheduled", targeted: 6_200, hours: 58 },
    ],
  },
  {
    slug: "guaiba",
    tradeName: "Imobiliária Guaíba",
    legalName: "Guaíba Empreendimentos Imobiliários Ltda.",
    document: "40667788000195",
    ddd: "51",
    plan: "growth",
    status: "active",
    billing: "ok",
    createdDaysAgo: 140,
    dailyVolume: 2_300,
    readRate: 0.58,
    optOutRate: 0.0065,
    recentVolume: { hours: 30, factor: 0.25 },
    contacts: 38_700,
    optedOutPct: 0.112,
    brand: { color: "#2b6f77", customDomain: null, customDomainStatus: "none" },
    owner: { name: "Fernando Lamb", email: "fernando@guaiba.example" },
    bms: [
      {
        name: "Imobiliária Guaíba",
        ownership: "client",
        verification: "verified",
        tier: "TIER_10K",
        numbers: [
          { suffix: "6001", label: "Locação", quality: "GREEN", status: "CONNECTED", share: 0.4 },
          { suffix: "6002", label: "Lançamentos", quality: "RED", status: "FLAGGED", share: 0.45, qualityChangedDaysAgo: 1.4, deliveryRate: 0.86 },
          { suffix: "6003", label: "Vendas", quality: "YELLOW", status: "CONNECTED", share: 0.15, qualityChangedDaysAgo: 2.2, deliveryRate: 0.93 },
        ],
      },
    ],
    templates: [
      { name: "visita_confirmada", category: "UTILITY", status: "APPROVED", body: "{{1}}, sua visita ao imóvel {{2}} está confirmada." },
      { name: "lancamento_residencial", category: "MARKETING", status: "PAUSED", quality: "RED", statusChangedDaysAgo: 1.2, body: "{{1}}, conheça o lançamento {{2}}." },
    ],
    campaigns: [
      { name: "Lançamento Residencial Orla", template: "lancamento_residencial", numberIndex: 1, status: "paused", pauseReason: "quality_drop", targeted: 24_000, hours: 33 },
    ],
  },
  {
    slug: "sorrisopleno",
    tradeName: "Clínica Sorriso Pleno",
    legalName: "Sorriso Pleno Odontologia Ltda.",
    document: "40778899000106",
    ddd: "48",
    plan: "growth",
    status: "active",
    billing: "ok",
    createdDaysAgo: 260,
    dailyVolume: 1_450,
    readRate: 0.86,
    optOutRate: 0.0011,
    contacts: 11_300,
    optedOutPct: 0.021,
    brand: { color: "#3a8fb7", customDomain: null, customDomainStatus: "none" },
    owner: { name: "Dra. Helena Pires", email: "helena@sorrisopleno.example" },
    bms: [
      {
        name: "Sorriso Pleno",
        ownership: "client",
        verification: "verified",
        tier: "TIER_2K",
        numbers: [
          { suffix: "7001", label: "Agendamentos", quality: "GREEN", status: "CONNECTED", share: 0.7 },
          { suffix: "7002", label: "Retornos", quality: "GREEN", status: "CONNECTED", share: 0.3 },
        ],
      },
    ],
    templates: [
      { name: "lembrete_consulta", category: "UTILITY", status: "APPROVED", body: "{{1}}, lembrete da sua consulta amanhã às {{2}}." },
      { name: "retorno_semestral", category: "MARKETING", status: "APPROVED", body: "{{1}}, está na hora da sua revisão semestral." },
    ],
    campaigns: [{ name: "Lembretes de consulta (automático)", template: "lembrete_consulta", numberIndex: 0, status: "running", targeted: 640, hours: 23 }],
  },
  {
    slug: "visaoclara",
    tradeName: "Ótica Visão Clara",
    legalName: "Visão Clara Ótica e Relojoaria Ltda.",
    document: "40889900000117",
    ddd: "21",
    plan: "growth",
    status: "past_due",
    billing: "overdue",
    createdDaysAgo: 190,
    dailyVolume: 980,
    readRate: 0.69,
    optOutRate: 0.0024,
    contacts: 17_600,
    optedOutPct: 0.047,
    brand: { color: "#6b4fa0", customDomain: null, customDomainStatus: "none" },
    owner: { name: "Carlos Menezes", email: "carlos@visaoclara.example" },
    bms: [
      {
        name: "Ótica Visão Clara",
        ownership: "client",
        verification: "verified",
        tier: "TIER_2K",
        numbers: [
          { suffix: "8001", label: "Atendimento", quality: "GREEN", status: "CONNECTED", share: 0.65 },
          { suffix: "8002", label: "Promoções", quality: "GREEN", status: "CONNECTED", share: 0.35 },
        ],
      },
    ],
    templates: [
      { name: "oculos_pronto", category: "UTILITY", status: "APPROVED", body: "{{1}}, seus óculos estão prontos para retirada." },
      { name: "exame_de_vista", category: "MARKETING", status: "APPROVED", body: "{{1}}, faça seu exame de vista com desconto." },
    ],
    campaigns: [{ name: "Exame de vista — novembro", template: "exame_de_vista", numberIndex: 1, status: "scheduled", targeted: 7_100, hours: 37 }],
  },
  {
    slug: "pampa",
    tradeName: "Auto Center Pampa",
    legalName: "Pampa Serviços Automotivos Ltda.",
    document: "40990011000128",
    ddd: "53",
    plan: "start",
    status: "active",
    billing: "ok",
    createdDaysAgo: 48,
    dailyVolume: 300,
    readRate: 0.79,
    optOutRate: 0.0015,
    contacts: 4_100,
    optedOutPct: 0.019,
    brand: { color: "#a33b2b", customDomain: null, customDomainStatus: "none" },
    owner: { name: "Rogério Dutra", email: "rogerio@pampa.example" },
    bms: [
      {
        name: "Auto Center Pampa",
        ownership: "client",
        verification: "pending",
        tier: "TIER_250",
        numbers: [{ suffix: "9001", label: "Oficina", quality: "GREEN", status: "CONNECTED", share: 1 }],
      },
    ],
    templates: [
      { name: "revisao_pronta", category: "UTILITY", status: "APPROVED", body: "{{1}}, seu veículo {{2}} está pronto." },
      { name: "troca_de_oleo", category: "MARKETING", status: "PENDING", statusChangedDaysAgo: 0.3, body: "{{1}}, está chegando a hora da troca de óleo." },
    ],
    campaigns: [{ name: "Veículos prontos (automático)", template: "revisao_pronta", numberIndex: 0, status: "running", targeted: 260, hours: 14 }],
  },
  {
    slug: "patasecia",
    tradeName: "Patas & Cia Pet Shop",
    legalName: "Patas e Companhia Pet Shop Ltda.",
    document: "41001122000139",
    ddd: "51",
    plan: "start",
    status: "active",
    billing: "ok",
    createdDaysAgo: 95,
    dailyVolume: 310,
    readRate: 0.82,
    optOutRate: 0.0009,
    contacts: 3_200,
    optedOutPct: 0.011,
    brand: { color: "#d08a1e", customDomain: null, customDomainStatus: "none" },
    owner: { name: "Bianca Rech", email: "bianca@patasecia.example" },
    bms: [
      {
        name: "Patas & Cia",
        ownership: "client",
        verification: "verified",
        tier: "TIER_2K",
        numbers: [{ suffix: "9101", label: "Banho e tosa", quality: "GREEN", status: "CONNECTED", share: 1 }],
      },
    ],
    templates: [{ name: "banho_agendado", category: "UTILITY", status: "APPROVED", body: "{{1}}, o banho do {{2}} está agendado para {{3}}." }],
    campaigns: [],
  },
  {
    slug: "academiaritmo",
    tradeName: "Academia Ritmo",
    legalName: "Ritmo Atividades Físicas Ltda.",
    document: "41112233000140",
    ddd: "31",
    plan: "start",
    status: "trial",
    billing: "ok",
    createdDaysAgo: 6,
    dailyVolume: 60,
    readRate: 0.71,
    optOutRate: 0.002,
    contacts: 1_450,
    optedOutPct: 0.006,
    brand: { color: "#2c8c7d", customDomain: null, customDomainStatus: "none" },
    owner: { name: "Thiago Arantes", email: "thiago@academiaritmo.example" },
    bms: [
      {
        name: "Academia Ritmo",
        ownership: "client",
        verification: "not_verified",
        tier: "TIER_250",
        numbers: [{ suffix: "9201", label: "Recepção", quality: "UNKNOWN", status: "CONNECTED", share: 1, displayNameStatus: "PENDING_REVIEW" }],
      },
    ],
    templates: [{ name: "boas_vindas", category: "UTILITY", status: "PENDING", statusChangedDaysAgo: 0.2, body: "{{1}}, boas-vindas à Ritmo!" }],
    campaigns: [],
  },
  {
    slug: "alicerce",
    tradeName: "Construtora Alicerce",
    legalName: "Alicerce Construções e Incorporações S.A.",
    document: "41223344000151",
    ddd: "61",
    plan: "growth",
    status: "suspended",
    billing: "blocked",
    createdDaysAgo: 210,
    stoppedDaysAgo: 5,
    dailyVolume: 900,
    readRate: 0.55,
    optOutRate: 0.0072,
    contacts: 27_500,
    optedOutPct: 0.139,
    brand: { color: "#7a6a52", customDomain: null, customDomainStatus: "none" },
    owner: { name: "Sérgio Albuquerque", email: "sergio@alicerce.example" },
    bms: [
      {
        name: "Construtora Alicerce",
        ownership: "client",
        verification: "verified",
        tier: "TIER_10K",
        numbers: [
          { suffix: "9301", label: "Comercial", quality: "RED", status: "RESTRICTED", share: 0.7, qualityChangedDaysAgo: 6, deliveryRate: 0.84, sendingEnabled: false },
          { suffix: "9302", label: "Relacionamento", quality: "YELLOW", status: "CONNECTED", share: 0.3, qualityChangedDaysAgo: 7, sendingEnabled: false },
        ],
      },
    ],
    templates: [{ name: "feirao_imoveis", category: "MARKETING", status: "PAUSED", quality: "RED", statusChangedDaysAgo: 6, body: "{{1}}, feirão de imóveis neste fim de semana." }],
    campaigns: [{ name: "Feirão de outubro", template: "feirao_imoveis", numberIndex: 0, status: "canceled", targeted: 30_000, hours: 140 }],
  },
];

export const OPT_OUT_BUTTON_TEXT = "Parar";
export { OPT_OUT_FOOTER };
