/**
 * Contrato de persistência. O service só fala com isto.
 * Hoje: MemoryRepo (mock). Depois: PgRepo implementando os mesmos métodos sobre
 * a migration (cada método mapeia para 1 query; os comentários indicam qual).
 */
import type {
  BusinessAccount, Campaign, CampaignStatus, ConsentEvent, ConsentStatus, Contact, Flow, FlowRun, FlowVersion, ID, Message,
  OptOut, PhoneNumber, Recipient, RecipientStatus, RunStep, Template,
} from './entities';

export interface DisparosRepo {
  // contas e números
  getBusinessAccount(tenantId: ID, id: ID): Promise<BusinessAccount | null>;
  listPhoneNumbers(tenantId: ID): Promise<PhoneNumber[]>;
  getPhoneNumber(tenantId: ID, id: ID): Promise<PhoneNumber | null>;
  /** Sem tenant: usado pelo webhook para descobrir o tenant pelo phone_number_id da Meta. */
  findPhoneNumberByMetaId(metaPhoneNumberId: string): Promise<PhoneNumber | null>;
  listTemplates(tenantId: ID): Promise<Template[]>;

  // contatos
  listContactsByAudience(tenantId: ID, tags: string[], all: boolean): Promise<Contact[]>;
  listTags(tenantId: ID): Promise<{ tag: string; count: number }[]>;
  getContactByPhone(tenantId: ID, phoneE164: string): Promise<Contact | null>;
  listContacts(tenantId: ID, opts: { search?: string; consent?: ConsentStatus; tag?: string; offset: number; limit: number }): Promise<{ rows: Contact[]; total: number }>;
  consentCounts(tenantId: ID): Promise<Record<ConsentStatus, number>>;
  insertContact(c: Contact): Promise<void>;
  updateContact(c: Contact): Promise<void>;
  /** Append-only. Opt-out passa por insertOptOut (que também grava o evento). */
  insertConsentEvent(e: ConsentEvent): Promise<void>;

  // blacklist
  listOptOuts(tenantId: ID, opts: { includeRevoked?: boolean; search?: string }): Promise<OptOut[]>;
  getActiveOptOut(tenantId: ID, phoneE164: string): Promise<OptOut | null>;
  /** ON CONFLICT (tenant_id, phone_e164) WHERE revoked_at IS NULL DO NOTHING -> devolve o ativo. */
  insertOptOut(o: OptOut): Promise<OptOut>;
  revokeOptOut(tenantId: ID, id: ID, reason: string, at: number): Promise<OptOut | null>;
  activeOptOutPhones(tenantId: ID): Promise<Set<string>>;

  // fluxos
  listFlows(tenantId: ID): Promise<Flow[]>;
  getFlow(tenantId: ID, id: ID): Promise<Flow | null>;
  insertFlow(f: Flow): Promise<void>;
  updateFlow(f: Flow): Promise<void>;
  insertFlowVersion(v: FlowVersion): Promise<void>;
  getFlowVersion(tenantId: ID, id: ID): Promise<FlowVersion | null>;
  latestVersionNumber(tenantId: ID, flowId: ID): Promise<number>;

  // campanhas
  listCampaigns(tenantId: ID): Promise<Campaign[]>;
  listCampaignsByStatus(statuses: CampaignStatus[]): Promise<Campaign[]>;   // worker (todos os tenants)
  getCampaign(tenantId: ID, id: ID): Promise<Campaign | null>;
  insertCampaign(c: Campaign): Promise<void>;
  updateCampaign(c: Campaign): Promise<void>;

  // destinatários
  insertRecipients(rs: Recipient[]): Promise<void>;
  /** UPDATE ... SET status='processing' WHERE id IN (SELECT ... WHERE status='pending' LIMIT n FOR UPDATE SKIP LOCKED) RETURNING * */
  claimPending(tenantId: ID, campaignId: ID, limit: number): Promise<Recipient[]>;
  updateRecipient(r: Recipient): Promise<void>;
  getRecipient(tenantId: ID, id: ID): Promise<Recipient | null>;
  findRecipientByWaMessageId(tenantId: ID, waMessageId: string): Promise<Recipient | null>;
  listRecipients(tenantId: ID, campaignId: ID, opts: { statuses?: RecipientStatus[]; search?: string; offset: number; limit: number }): Promise<{ rows: Recipient[]; total: number }>;
  countRecipientsByStatus(tenantId: ID, campaignId: ID): Promise<Record<RecipientStatus, number>>;

  // execuções
  insertRun(r: FlowRun): Promise<void>;
  updateRun(r: FlowRun): Promise<void>;
  getRun(tenantId: ID, id: ID): Promise<FlowRun | null>;
  /** WHERE status IN ('waiting_delay','waiting_reply') AND wake_at <= now FOR UPDATE SKIP LOCKED */
  listDueRuns(now: number, limit: number): Promise<FlowRun[]>;
  listActiveRunsByPhone(tenantId: ID, phoneE164: string): Promise<FlowRun[]>;
  /**
   * Progresso por destinatário (LEFT JOIN flow_runs ON r.flow_run_id = fr.id):
   *  inProgress = execução ativa; finished = pulado, falhou ou execução encerrada.
   */
  campaignProgress(tenantId: ID, campaignId: ID): Promise<{ inProgress: number; finished: number; optedOutDuringFlow: number }>;
  listRunsByIds(tenantId: ID, ids: ID[]): Promise<FlowRun[]>;
  insertStep(s: Omit<RunStep, 'id'>): Promise<void>;
  /** SELECT node_id, outcome, count(distinct run_id) FROM flow_run_steps WHERE campaign_id=$1 GROUP BY 1,2 */
  aggregateSteps(tenantId: ID, campaignId: ID): Promise<{ nodeId: string; outcome: string; runs: number }[]>;
  reachedByNode(tenantId: ID, campaignId: ID): Promise<Record<string, number>>;
  /** Contatos parados em cada etapa agora.
   *  SELECT current_node_id, count(*) FROM flow_runs WHERE tenant_id=$1 AND campaign_id=$2
   *    AND status IN ('active','waiting_delay','waiting_reply') GROUP BY 1   (índice campaign_id, status) */
  activeRunsByNode(tenantId: ID, campaignId: ID): Promise<Record<string, number>>;

  // mensagens
  insertMessage(m: Message): Promise<void>;
  updateMessage(m: Message): Promise<void>;
  getMessageByWaId(tenantId: ID, waMessageId: string): Promise<Message | null>;
  listMessagesByPhone(tenantId: ID, phoneE164: string, limit: number): Promise<Message[]>;
  /** Idempotência do webhook: INSERT ... ON CONFLICT (wa_message_id, status) DO NOTHING. true se é novo. */
  recordStatusEvent(tenantId: ID, waMessageId: string, status: string): Promise<boolean>;
  /** Contatos únicos que receberam modelo (fora da janela) desde `since`, no portfólio. */
  countBusinessInitiatedRecipients(businessAccountId: ID, since: number): Promise<Set<string>>;

  // janela de 24h
  getWindow(tenantId: ID, phoneNumberId: ID, phoneE164: string): Promise<number | null>;
  touchWindow(tenantId: ID, phoneNumberId: ID, phoneE164: string, at: number): Promise<void>;
}
