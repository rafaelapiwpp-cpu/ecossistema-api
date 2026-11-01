import type {
  Alert,
  BusinessManager,
  BusinessManagerId,
  Campaign,
  CampaignStatus,
  ConsentStatus,
  DailyNumberStats,
  HourlyNumberStats,
  ISODate,
  Lead,
  MessageTemplate,
  PhoneNumber,
  Plan,
  PortfolioLimitUsage,
  ServiceHealth,
  TemplateStatus,
  Tenant,
  TenantId,
  WhatsAppBusinessAccount,
} from "../domain";

/**
 * Contrato da camada de dados.
 *
 * As telas só falam com esta interface. Hoje existe a implementação mock
 * (data/mock); quando o Postgres entrar, uma PostgresDataSource implementa a
 * mesma interface e nenhuma tela muda. Regras:
 * - Tudo é assíncrono, mesmo no mock, para o código de tela já nascer "await".
 * - Retornos são objetos do domínio, serializáveis (sem Date, sem classes).
 * - Filtros por tenant são explícitos. No portal do cliente o tenantId vem da
 *   sessão e a implementação Postgres também aplica RLS como segunda barreira.
 */

export interface Clock {
  now(): Date;
}

export interface TenantFilter {
  tenantId?: TenantId;
}

export interface DateRange {
  /** Inclusivo, "YYYY-MM-DD" no fuso de operação. */
  from: ISODate;
  /** Inclusivo. */
  to: ISODate;
}

export interface TimeRange {
  /** Inclusivo. */
  from: Date;
  /** Exclusivo. */
  to: Date;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ConsentCount {
  tenantId: TenantId;
  status: ConsentStatus;
  count: number;
}

export interface DataSource {
  readonly kind: "mock" | "postgres";
  readonly clock: Clock;

  plans: {
    list(): Promise<Plan[]>;
  };

  tenants: {
    list(): Promise<Tenant[]>;
    get(id: TenantId): Promise<Tenant | null>;
  };

  businessManagers: {
    list(filter?: TenantFilter): Promise<BusinessManager[]>;
  };

  wabas: {
    list(filter?: TenantFilter): Promise<WhatsAppBusinessAccount[]>;
  };

  phoneNumbers: {
    list(filter?: TenantFilter & { businessManagerId?: BusinessManagerId }): Promise<PhoneNumber[]>;
  };

  templates: {
    list(filter?: TenantFilter & { status?: TemplateStatus[] }): Promise<MessageTemplate[]>;
  };

  campaigns: {
    list(filter?: TenantFilter & { status?: CampaignStatus[] }): Promise<Campaign[]>;
  };

  leads: {
    /** Contagem por status de consentimento — nunca carregar a base inteira para contar. */
    countByConsent(filter?: TenantFilter): Promise<ConsentCount[]>;
    list(filter: Required<TenantFilter> & { limit: number; cursor?: string }): Promise<Page<Lead>>;
  };

  metrics: {
    hourlyByNumber(range: TimeRange, filter?: TenantFilter): Promise<HourlyNumberStats[]>;
    dailyByNumber(range: DateRange, filter?: TenantFilter): Promise<DailyNumberStats[]>;
    /** Uso do limite de 24 h móveis de cada BM no instante `at`. */
    portfolioUsage(at: Date): Promise<PortfolioLimitUsage[]>;
  };

  infra: {
    services(): Promise<ServiceHealth[]>;
  };

  alerts: {
    listOpen(filter?: TenantFilter): Promise<Alert[]>;
  };
}
