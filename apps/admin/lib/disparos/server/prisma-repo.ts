/**
 * DisparosRepo sobre Prisma/Postgres (Neon). Mesmo contrato do MemoryRepo, então
 * o DisparosService (testado em memória) roda igual aqui.
 *
 * Escopo (tenant): `t` é o clienteId; o escopo do operador (v1, sem auth) grava
 * clienteId = null. BMs, números e templates vêm das tabelas de contingência
 * (pt-BR) e são convertidos para as entidades do módulo aqui dentro.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import type { DisparosRepo } from './repo';
import type {
  BusinessAccount, Campaign, CampaignStatus, ConsentEvent, ConsentSource, ConsentStatus, Contact, Flow, FlowRun, FlowVersion, ID,
  Message, MessageStatus, MessagingTier, OptOut, OptOutSource, PhoneNumber, Recipient, RecipientStatus, RunStep, Template,
} from './entities';
import type { FlowGraph } from '../domain/flow-types';
import type { RunStatus } from '../domain/flow-engine';

export const OPERATOR_SCOPE = 'operador';

const ACTIVE_RUN = ['active', 'waiting_delay', 'waiting_reply'];
const SKIPPED = ['skipped_optout', 'skipped_no_consent', 'skipped_invalid'];
const ALL_RECIPIENT: RecipientStatus[] = [
  'pending', 'skipped_optout', 'skipped_no_consent', 'skipped_invalid', 'processing',
  'accepted', 'sent', 'delivered', 'read', 'failed',
];

const d = (ms: number | null | undefined) => (ms == null ? null : new Date(ms));
const ms = (dt: Date | null | undefined) => (dt ? dt.getTime() : null);
const json = (v: unknown) => v as Prisma.InputJsonValue;

// ---- contingência (pt-BR) -> entidades do módulo -----------------------------
const QUALITY: Record<string, PhoneNumber['qualityRating']> = { alta: 'GREEN', media: 'YELLOW', baixa: 'RED', sem_avaliacao: 'UNKNOWN' };
const SENDABLE = new Set(['ativo', 'aquecendo']);
const TIER: Record<number, MessagingTier> = { 250: 'TIER_250', 1000: 'TIER_1K', 2000: 'TIER_2K', 10000: 'TIER_10K', 100000: 'TIER_100K', 0: 'TIER_UNLIMITED' };
const TPL_CATEGORY: Record<string, Template['category']> = { marketing: 'MARKETING', utilidade: 'UTILITY', autenticacao: 'AUTHENTICATION' };
const TPL_STATUS: Record<string, Template['status']> = { aprovado: 'APPROVED', em_analise: 'PENDING', rejeitado: 'REJECTED', pausado: 'PAUSED', desativado: 'DISABLED' };

/** Origem do opt-out no service <-> source gravado no ConsentEvent. */
const OPTOUT_TO_SOURCE: Record<OptOutSource, string> = {
  keyword: 'whatsapp_keyword', button: 'opt_out_button', flow_node: 'flow_node',
  meta_marketing_optout: 'meta_marketing_optout', manual: 'admin', import: 'import',
};
const SOURCE_TO_OPTOUT: Record<string, OptOutSource> = Object.fromEntries(Object.entries(OPTOUT_TO_SOURCE).map(([k, v]) => [v, k as OptOutSource]));

type NumeroRow = { id: string; telefone: string; bmId: string | null; status: string; qualidade: string; metaPhoneId: string | null; bm?: { nome: string } | null };
type LeadRow = Prisma.LeadGetPayload<object>;
type EventRow = Prisma.ConsentEventGetPayload<object>;

export class PrismaRepo implements DisparosRepo {
  constructor(private readonly db: PrismaClient, private readonly opts: { providerKind: 'mock' | 'meta' }) {}

  /** escopo do service -> coluna clienteId */
  private cid(t: ID): string | null { return t === OPERATOR_SCOPE ? null : t; }
  private scope(cid: string | null): ID { return cid ?? OPERATOR_SCOPE; }
  private cidSql(t: ID) {
    const c = this.cid(t);
    return c === null ? Prisma.sql`"clienteId" IS NULL` : Prisma.sql`"clienteId" = ${c}`;
  }

  // ===========================================================================
  // Contas e números (tabelas de contingência)
  // ===========================================================================

  private toPhone(t: ID, n: NumeroRow): PhoneNumber {
    return {
      id: n.id, tenantId: t, businessAccountId: n.bmId ?? '',
      phoneNumberId: n.metaPhoneId ?? `sim-${n.id}`,
      displayPhoneNumber: n.telefone, verifiedName: n.bm?.nome ?? '',
      qualityRating: QUALITY[n.qualidade] ?? 'UNKNOWN',
      provider: this.opts.providerKind,
      status: n.status,
      canSend: SENDABLE.has(n.status) && n.qualidade !== 'baixa',
    };
  }

  async getBusinessAccount(t: ID, id: ID): Promise<BusinessAccount | null> {
    if (!id) return null;
    const b = await this.db.bm.findUnique({ where: { id } });
    if (!b) return null;
    return { id: b.id, tenantId: t, wabaId: b.metaBmId ?? b.id, name: b.nome, messagingLimitTier: TIER[b.nivelLimite] ?? 'TIER_250' };
  }

  async listPhoneNumbers(t: ID) {
    const rows = await this.db.numero.findMany({ orderBy: { criadoEm: 'asc' }, include: { bm: { select: { nome: true } } } });
    return rows.map((n) => this.toPhone(t, n));
  }

  async getPhoneNumber(t: ID, id: ID) {
    const n = await this.db.numero.findUnique({ where: { id }, include: { bm: { select: { nome: true } } } });
    return n ? this.toPhone(t, n) : null;
  }

  async findPhoneNumberByMetaId(meta: string) {
    const n = meta.startsWith('sim-')
      ? await this.db.numero.findUnique({ where: { id: meta.slice(4) }, include: { bm: { select: { nome: true } } } })
      : await this.db.numero.findFirst({ where: { metaPhoneId: meta }, include: { bm: { select: { nome: true } } } });
    // v1: número pertence ao escopo do operador (o webhook resolve o tenant pelo número, nunca pelo payload)
    return n ? this.toPhone(OPERATOR_SCOPE, n) : null;
  }

  async listTemplates(t: ID): Promise<Template[]> {
    const rows = await this.db.template.findMany({ orderBy: { nome: 'asc' } });
    return rows.map((x) => ({
      id: x.id, tenantId: t, businessAccountId: '', name: x.nome, language: x.idioma,
      category: TPL_CATEGORY[x.categoria] ?? 'MARKETING', status: TPL_STATUS[x.status] ?? 'PENDING',
      bodyText: x.corpo, variableExamples: [], buttons: [],
    }));
  }

  // ===========================================================================
  // Contatos e consentimento
  // ===========================================================================

  private toContact(l: LeadRow): Contact {
    return {
      id: l.id, tenantId: this.scope(l.clienteId), name: l.name, phoneE164: l.phone, tags: l.tags,
      attributes: (l.attributes ?? {}) as Record<string, string>,
      consent: (l.consent as ConsentStatus) ?? 'unknown', consentSource: (l.consentSource as ConsentSource | null) ?? null,
      consentAt: ms(l.consentChangedAt), createdAt: l.createdAt.getTime(),
    };
  }

  async listContactsByAudience(t: ID, tags: string[], all: boolean) {
    const rows = await this.db.lead.findMany({
      where: { clienteId: this.cid(t), ...(all ? {} : { tags: { hasSome: tags } }) },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((l) => this.toContact(l));
  }

  async listTags(t: ID) {
    const rows = await this.db.$queryRaw<{ tag: string; count: number }[]>`
      SELECT tg AS tag, count(*)::int AS count FROM "lead", unnest("tags") AS tg
      WHERE ${this.cidSql(t)} GROUP BY tg ORDER BY count DESC, tg ASC LIMIT 200`;
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  }

  async getContactByPhone(t: ID, phone: string) {
    const l = await this.db.lead.findFirst({ where: { clienteId: this.cid(t), phone } });
    return l ? this.toContact(l) : null;
  }

  async listContacts(t: ID, o: { search?: string; consent?: ConsentStatus; tag?: string; offset: number; limit: number }) {
    const q = o.search?.trim() ?? '';
    const digits = q.replace(/\D/g, '');
    const where: Prisma.LeadWhereInput = {
      clienteId: this.cid(t),
      ...(o.consent ? { consent: o.consent } : {}),
      ...(o.tag ? { tags: { has: o.tag } } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(digits ? [{ phone: { contains: digits } }] : [])] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip: o.offset, take: o.limit }),
      this.db.lead.count({ where }),
    ]);
    return { rows: rows.map((l) => this.toContact(l)), total };
  }

  async consentCounts(t: ID) {
    const g = await this.db.lead.groupBy({ by: ['consent'], where: { clienteId: this.cid(t) }, _count: { _all: true } });
    const out: Record<ConsentStatus, number> = { opted_in: 0, opted_out: 0, unknown: 0 };
    for (const r of g) if (r.consent in out) out[r.consent as ConsentStatus] = r._count._all;
    return out;
  }

  async insertContact(c: Contact) {
    await this.db.lead.create({
      data: {
        id: c.id, clienteId: this.cid(c.tenantId), phone: c.phoneE164, name: c.name, tags: c.tags, attributes: json(c.attributes),
        consent: c.consent, consentSource: c.consentSource, consentChangedAt: d(c.consentAt), createdAt: new Date(c.createdAt),
      },
    });
  }

  async updateContact(c: Contact) {
    await this.db.lead.update({
      where: { id: c.id },
      data: { name: c.name, tags: c.tags, attributes: json(c.attributes), consent: c.consent, consentSource: c.consentSource, consentChangedAt: d(c.consentAt) },
    });
  }

  async insertConsentEvent(e: ConsentEvent) {
    await this.db.consentEvent.create({
      data: {
        id: e.id, clienteId: this.cid(e.tenantId), leadId: e.contactId, phone: e.phoneE164, status: e.status, source: e.source,
        note: e.note, keyword: e.keyword, waMessageId: e.waMessageId, campaignId: e.campaignId, flowRunId: e.flowRunId, createdAt: new Date(e.createdAt),
      },
    });
  }

  // ===========================================================================
  // Blacklist = Lead.consent 'opted_out' + ConsentEvent (log)
  // ===========================================================================

  private toOptOut(e: EventRow, lead: LeadRow | null, revoked: EventRow | null): OptOut {
    return {
      id: e.id, tenantId: this.scope(e.clienteId), phoneE164: e.phone, contactId: lead?.id ?? e.leadId, contactName: lead?.name || null,
      source: SOURCE_TO_OPTOUT[e.source] ?? 'manual', reason: e.note, triggerText: e.keyword,
      campaignId: e.campaignId, flowRunId: e.flowRunId, waMessageId: e.waMessageId,
      createdAt: e.createdAt.getTime(), revokedAt: ms(revoked?.createdAt), revokeReason: revoked?.note ?? null,
    };
  }

  async getActiveOptOut(t: ID, phone: string) {
    const lead = await this.db.lead.findFirst({ where: { clienteId: this.cid(t), phone, consent: 'opted_out' } });
    if (!lead) return null;
    const e = await this.db.consentEvent.findFirst({ where: { clienteId: this.cid(t), phone, status: 'opted_out' }, orderBy: { createdAt: 'desc' } });
    if (e) return this.toOptOut(e, lead, null);
    return {
      id: `lead:${lead.id}`, tenantId: t, phoneE164: phone, contactId: lead.id, contactName: lead.name || null, source: 'manual',
      reason: null, triggerText: null, campaignId: null, flowRunId: null, waMessageId: null,
      createdAt: (lead.consentChangedAt ?? lead.updatedAt).getTime(), revokedAt: null, revokeReason: null,
    } satisfies OptOut;
  }

  async insertOptOut(o: OptOut) {
    const existing = await this.getActiveOptOut(o.tenantId, o.phoneE164);
    if (existing) return existing;
    const cid = this.cid(o.tenantId);
    const at = new Date(o.createdAt);
    const source = OPTOUT_TO_SOURCE[o.source];
    let lead = await this.db.lead.findFirst({ where: { clienteId: cid, phone: o.phoneE164 } });
    lead = lead
      ? await this.db.lead.update({ where: { id: lead.id }, data: { consent: 'opted_out', consentSource: source, consentChangedAt: at } })
      : await this.db.lead.create({ data: { clienteId: cid, phone: o.phoneE164, name: o.contactName ?? '', consent: 'opted_out', consentSource: source, consentChangedAt: at } });
    const e = await this.db.consentEvent.create({
      data: {
        id: o.id, clienteId: cid, leadId: lead.id, phone: o.phoneE164, status: 'opted_out', source,
        note: o.reason, keyword: o.triggerText, waMessageId: o.waMessageId, campaignId: o.campaignId, flowRunId: o.flowRunId, createdAt: at,
      },
    });
    return this.toOptOut(e, lead, null);
  }

  /** "Reativar" = novo opt-in registrado (o opt-out continua no log). */
  async revokeOptOut(t: ID, id: ID, reason: string, at: number) {
    const cid = this.cid(t);
    const e = await this.db.consentEvent.findFirst({ where: { id, clienteId: cid, status: 'opted_out' } });
    if (!e) return null;
    const lead = await this.db.lead.findFirst({ where: { clienteId: cid, phone: e.phone, consent: 'opted_out' } });
    if (!lead) return null;
    const when = new Date(at);
    const optIn = await this.db.consentEvent.create({
      data: { clienteId: cid, leadId: lead.id, phone: e.phone, status: 'opted_in', source: 'support_request', note: reason, createdAt: when },
    });
    const updated = await this.db.lead.update({ where: { id: lead.id }, data: { consent: 'opted_in', consentSource: 'support_request', consentChangedAt: when } });
    return this.toOptOut(e, updated, optIn);
  }

  async activeOptOutPhones(t: ID) {
    const rows = await this.db.lead.findMany({ where: { clienteId: this.cid(t), consent: 'opted_out' }, select: { phone: true } });
    return new Set<string>(rows.map((r) => r.phone));
  }

  async listOptOuts(t: ID, o: { includeRevoked?: boolean; search?: string }) {
    const cid = this.cid(t);
    const [events, optIns, leads] = await Promise.all([
      this.db.consentEvent.findMany({ where: { clienteId: cid, status: 'opted_out' }, orderBy: { createdAt: 'desc' }, take: 2000 }),
      this.db.consentEvent.findMany({ where: { clienteId: cid, status: 'opted_in', source: 'support_request' }, orderBy: { createdAt: 'desc' }, take: 2000 }),
      this.db.lead.findMany({ where: { clienteId: cid, OR: [{ consent: 'opted_out' }, { consentSource: 'support_request' }] } }),
    ]);
    const leadByPhone = new Map<string, LeadRow>(leads.map((l): [string, LeadRow] => [l.phone, l]));
    const seen = new Set<string>();
    const out: OptOut[] = [];
    for (const e of events) {
      if (seen.has(e.phone)) continue;                 // um registro por telefone: o opt-out mais recente
      seen.add(e.phone);
      const lead = leadByPhone.get(e.phone) ?? null;
      const active = lead?.consent === 'opted_out';
      if (!active && !o.includeRevoked) continue;
      const revoked = active ? null : optIns.find((x) => x.phone === e.phone && x.createdAt >= e.createdAt) ?? null;
      out.push(this.toOptOut(e, lead, revoked));
    }
    const q = o.search?.trim().toLowerCase() ?? '';
    const digits = q.replace(/\D/g, '');
    return q ? out.filter((x) => (digits && x.phoneE164.includes(digits)) || (x.contactName ?? '').toLowerCase().includes(q)) : out;
  }

  // ===========================================================================
  // Fluxos
  // ===========================================================================

  private toFlow(f: Prisma.FlowGetPayload<object>): Flow {
    return {
      id: f.id, tenantId: this.scope(f.clienteId), name: f.name, description: f.description,
      status: f.status as Flow['status'], draftGraph: f.draftGraph as unknown as FlowGraph,
      publishedVersionId: f.publishedVersionId, createdAt: f.createdAt.getTime(), updatedAt: f.updatedAt.getTime(),
    };
  }

  async listFlows(t: ID) {
    return (await this.db.flow.findMany({ where: { clienteId: this.cid(t) }, orderBy: { updatedAt: 'desc' } })).map((f) => this.toFlow(f));
  }
  async getFlow(t: ID, id: ID) {
    const f = await this.db.flow.findFirst({ where: { id, clienteId: this.cid(t) } });
    return f ? this.toFlow(f) : null;
  }
  async insertFlow(f: Flow) {
    await this.db.flow.create({
      data: {
        id: f.id, clienteId: this.cid(f.tenantId), name: f.name, description: f.description, status: f.status,
        draftGraph: json(f.draftGraph), publishedVersionId: f.publishedVersionId, createdAt: new Date(f.createdAt),
      },
    });
  }
  async updateFlow(f: Flow) {
    await this.db.flow.update({
      where: { id: f.id },
      data: { name: f.name, description: f.description, status: f.status, draftGraph: json(f.draftGraph), publishedVersionId: f.publishedVersionId },
    });
  }
  async insertFlowVersion(v: FlowVersion) {
    await this.db.flowVersion.create({
      data: { id: v.id, clienteId: this.cid(v.tenantId), flowId: v.flowId, version: v.version, graph: json(v.graph), publishedAt: new Date(v.publishedAt) },
    });
  }
  async getFlowVersion(t: ID, id: ID): Promise<FlowVersion | null> {
    const v = await this.db.flowVersion.findFirst({ where: { id, clienteId: this.cid(t) } });
    return v ? { id: v.id, tenantId: t, flowId: v.flowId, version: v.version, graph: v.graph as unknown as FlowGraph, publishedAt: v.publishedAt.getTime() } : null;
  }
  async latestVersionNumber(_t: ID, flowId: ID) {
    const r = await this.db.flowVersion.aggregate({ where: { flowId }, _max: { version: true } });
    return r._max.version ?? 0;
  }

  // ===========================================================================
  // Campanhas
  // ===========================================================================

  private toCampaign(c: Prisma.CampaignGetPayload<object>): Campaign {
    return {
      id: c.id, tenantId: this.scope(c.clienteId), name: c.name, phoneNumberId: c.numeroId, flowId: c.flowId, flowVersionId: c.flowVersionId,
      status: c.status as CampaignStatus, pauseReason: c.pauseReason, blockedReason: (c.blockedReason as Campaign['blockedReason']) ?? null,
      audience: c.audience as unknown as Campaign['audience'], ratePerMinute: c.ratePerMinute, totalRecipients: c.totalRecipients,
      scheduledAt: ms(c.scheduledAt), startedAt: ms(c.startedAt), finishedAt: ms(c.finishedAt), lastDispatchAt: ms(c.lastDispatchAt),
      createdAt: c.createdAt.getTime(), updatedAt: c.updatedAt.getTime(),
    };
  }
  private campaignData(c: Campaign) {
    return {
      name: c.name, numeroId: c.phoneNumberId, flowId: c.flowId, flowVersionId: c.flowVersionId, status: c.status,
      pauseReason: c.pauseReason, blockedReason: c.blockedReason, audience: json(c.audience), ratePerMinute: c.ratePerMinute,
      totalRecipients: c.totalRecipients, scheduledAt: d(c.scheduledAt), startedAt: d(c.startedAt), finishedAt: d(c.finishedAt),
      lastDispatchAt: d(c.lastDispatchAt),
    };
  }

  async listCampaigns(t: ID) {
    return (await this.db.campaign.findMany({ where: { clienteId: this.cid(t) }, orderBy: { createdAt: 'desc' } })).map((c) => this.toCampaign(c));
  }
  async listCampaignsByStatus(statuses: CampaignStatus[]) {
    return (await this.db.campaign.findMany({ where: { status: { in: statuses } } })).map((c) => this.toCampaign(c));
  }
  async getCampaign(t: ID, id: ID) {
    const c = await this.db.campaign.findFirst({ where: { id, clienteId: this.cid(t) } });
    return c ? this.toCampaign(c) : null;
  }
  async insertCampaign(c: Campaign) {
    await this.db.campaign.create({
      data: {
        id: c.id, clienteId: this.cid(c.tenantId), provider: this.opts.providerKind === 'meta' ? 'meta' : 'simulation',
        createdAt: new Date(c.createdAt), ...this.campaignData(c),
      },
    });
  }
  async updateCampaign(c: Campaign) {
    await this.db.campaign.update({ where: { id: c.id }, data: this.campaignData(c) });
  }

  // ===========================================================================
  // Destinatários
  // ===========================================================================

  private toRecipient(r: Prisma.CampaignRecipientGetPayload<object>): Recipient {
    return {
      id: r.id, tenantId: this.scope(r.clienteId), campaignId: r.campaignId, contactId: r.leadId, phoneE164: r.phone, name: r.name,
      variables: (r.variables ?? {}) as Record<string, string>, status: r.status as RecipientStatus, attempts: r.attempts,
      flowRunId: r.flowRunId, waMessageId: r.waMessageId, errorCode: r.errorCode, errorTitle: r.errorTitle,
      acceptedAt: ms(r.acceptedAt), sentAt: ms(r.sentAt), deliveredAt: ms(r.deliveredAt), readAt: ms(r.readAt), failedAt: ms(r.failedAt),
      updatedAt: r.updatedAt.getTime(),
    };
  }
  private recipientData(r: Recipient) {
    return {
      leadId: r.contactId, phone: r.phoneE164, name: r.name, variables: json(r.variables), status: r.status, attempts: r.attempts,
      flowRunId: r.flowRunId, waMessageId: r.waMessageId, errorCode: r.errorCode, errorTitle: r.errorTitle,
      acceptedAt: d(r.acceptedAt), sentAt: d(r.sentAt), deliveredAt: d(r.deliveredAt), readAt: d(r.readAt), failedAt: d(r.failedAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async insertRecipients(rs: Recipient[]) {
    for (let i = 0; i < rs.length; i += 1000) {
      await this.db.campaignRecipient.createMany({
        data: rs.slice(i, i + 1000).map((r) => ({ id: r.id, clienteId: this.cid(r.tenantId), campaignId: r.campaignId, ...this.recipientData(r) })),
      });
    }
  }

  /** Só um worker por vez (lease em worker_lease), então não precisa de SKIP LOCKED. */
  async claimPending(_t: ID, campaignId: ID, limit: number) {
    const rows = await this.db.campaignRecipient.findMany({ where: { campaignId, status: 'pending' }, orderBy: { id: 'asc' }, take: limit });
    if (!rows.length) return [];
    await this.db.campaignRecipient.updateMany({ where: { id: { in: rows.map((r) => r.id) }, status: 'pending' }, data: { status: 'processing' } });
    return rows.map((r) => ({ ...this.toRecipient(r), status: 'processing' as const }));
  }
  async updateRecipient(r: Recipient) {
    await this.db.campaignRecipient.update({ where: { id: r.id }, data: this.recipientData(r) });
  }
  async getRecipient(t: ID, id: ID) {
    const r = await this.db.campaignRecipient.findFirst({ where: { id, clienteId: this.cid(t) } });
    return r ? this.toRecipient(r) : null;
  }
  async findRecipientByWaMessageId(t: ID, waMessageId: string) {
    const r = await this.db.campaignRecipient.findFirst({ where: { waMessageId, clienteId: this.cid(t) } });
    return r ? this.toRecipient(r) : null;
  }
  async listRecipients(t: ID, campaignId: ID, o: { statuses?: RecipientStatus[]; search?: string; offset: number; limit: number }) {
    const q = o.search?.trim() ?? '';
    const digits = q.replace(/\D/g, '');
    const where: Prisma.CampaignRecipientWhereInput = {
      campaignId, clienteId: this.cid(t),
      ...(o.statuses?.length ? { status: { in: o.statuses } } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(digits ? [{ phone: { contains: digits } }] : [])] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.campaignRecipient.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: o.offset, take: o.limit }),
      this.db.campaignRecipient.count({ where }),
    ]);
    return { rows: rows.map((r) => this.toRecipient(r)), total };
  }
  async countRecipientsByStatus(t: ID, campaignId: ID) {
    const g = await this.db.campaignRecipient.groupBy({ by: ['status'], where: { campaignId, clienteId: this.cid(t) }, _count: { _all: true } });
    const out = Object.fromEntries(ALL_RECIPIENT.map((s) => [s, 0])) as Record<RecipientStatus, number>;
    for (const r of g) if (r.status in out) out[r.status as RecipientStatus] = r._count._all;
    return out;
  }

  // ===========================================================================
  // Execuções
  // ===========================================================================

  private toRun(r: Prisma.FlowRunGetPayload<object>): FlowRun {
    return {
      id: r.id, tenantId: this.scope(r.clienteId), flowId: r.flowId, flowVersionId: r.flowVersionId, campaignId: r.campaignId,
      campaignRecipientId: r.campaignRecipientId, phoneNumberId: r.numeroId, contactId: r.leadId, phoneE164: r.phone,
      status: r.status as RunStatus, currentNodeId: r.currentNodeId, wakeAt: ms(r.wakeAt),
      context: (r.context ?? { vars: {}, answers: {} }) as unknown as FlowRun['context'],
      stepCount: r.stepCount, lastError: r.lastError, startedAt: r.startedAt.getTime(), finishedAt: ms(r.finishedAt), updatedAt: r.updatedAt.getTime(),
    };
  }
  private runData(r: FlowRun) {
    return {
      status: r.status, currentNodeId: r.currentNodeId, wakeAt: d(r.wakeAt), context: json(r.context), stepCount: r.stepCount,
      lastError: r.lastError, finishedAt: d(r.finishedAt), updatedAt: new Date(r.updatedAt),
    };
  }

  async insertRun(r: FlowRun) {
    await this.db.flowRun.create({
      data: {
        id: r.id, clienteId: this.cid(r.tenantId), flowId: r.flowId, flowVersionId: r.flowVersionId, campaignId: r.campaignId,
        campaignRecipientId: r.campaignRecipientId, numeroId: r.phoneNumberId, leadId: r.contactId, phone: r.phoneE164,
        startedAt: new Date(r.startedAt), ...this.runData(r),
      },
    });
  }
  async updateRun(r: FlowRun) {
    await this.db.flowRun.update({ where: { id: r.id }, data: this.runData(r) });
  }
  async getRun(t: ID, id: ID) {
    const r = await this.db.flowRun.findFirst({ where: { id, clienteId: this.cid(t) } });
    return r ? this.toRun(r) : null;
  }
  async listDueRuns(now: number, limit: number) {
    const rows = await this.db.flowRun.findMany({
      where: { status: { in: ['waiting_delay', 'waiting_reply'] }, wakeAt: { lte: new Date(now) } },
      orderBy: { wakeAt: 'asc' }, take: limit,
    });
    return rows.map((r) => this.toRun(r));
  }
  async listActiveRunsByPhone(t: ID, phone: string) {
    const rows = await this.db.flowRun.findMany({ where: { clienteId: this.cid(t), phone, status: { in: ACTIVE_RUN } }, orderBy: { startedAt: 'desc' } });
    return rows.map((r) => this.toRun(r));
  }
  async campaignProgress(t: ID, campaignId: ID) {
    const skipped = Prisma.join(SKIPPED);
    const active = Prisma.join(ACTIVE_RUN);
    const [row] = await this.db.$queryRaw<{ finished: number; in_progress: number; opted_out: number }[]>`
      SELECT
        count(*) FILTER (WHERE r."status" IN (${skipped})
          OR (fr."id" IS NOT NULL AND fr."status" NOT IN (${active}))
          OR (fr."id" IS NULL AND r."status" = 'failed'))::int AS finished,
        count(*) FILTER (WHERE r."status" NOT IN (${skipped}) AND fr."status" IN (${active}))::int AS in_progress,
        count(*) FILTER (WHERE r."status" NOT IN (${skipped}) AND fr."status" = 'opted_out')::int AS opted_out
      FROM "campaign_recipient" r
      LEFT JOIN "flow_run" fr ON fr."id" = r."flowRunId"
      WHERE r."campaignId" = ${campaignId} AND ${this.cidSqlFor('r', t)}`;
    return { inProgress: Number(row?.in_progress ?? 0), finished: Number(row?.finished ?? 0), optedOutDuringFlow: Number(row?.opted_out ?? 0) };
  }
  private cidSqlFor(alias: string, t: ID) {
    const c = this.cid(t);
    const col = Prisma.raw(`${alias}."clienteId"`);
    return c === null ? Prisma.sql`${col} IS NULL` : Prisma.sql`${col} = ${c}`;
  }
  async listRunsByIds(t: ID, ids: ID[]) {
    if (!ids.length) return [];
    return (await this.db.flowRun.findMany({ where: { id: { in: ids }, clienteId: this.cid(t) } })).map((r) => this.toRun(r));
  }
  async insertStep(s: Omit<RunStep, 'id'>) {
    await this.db.flowRunStep.create({
      data: {
        clienteId: this.cid(s.tenantId), runId: s.runId, campaignId: s.campaignId, nodeId: s.nodeId, nodeType: s.nodeType,
        outcome: s.outcome, messageId: s.messageId, ...(s.detail ? { detail: json(s.detail) } : {}), createdAt: new Date(s.createdAt),
      },
    });
  }
  async aggregateSteps(t: ID, campaignId: ID) {
    const rows = await this.db.$queryRaw<{ nodeId: string; outcome: string; runs: number }[]>`
      SELECT "nodeId", "outcome", count(DISTINCT "runId")::int AS runs FROM "flow_run_step"
      WHERE "campaignId" = ${campaignId} AND ${this.cidSql(t)} GROUP BY 1, 2`;
    return rows.map((r) => ({ nodeId: r.nodeId, outcome: r.outcome, runs: Number(r.runs) }));
  }
  async reachedByNode(t: ID, campaignId: ID) {
    const rows = await this.db.$queryRaw<{ nodeId: string; runs: number }[]>`
      SELECT "nodeId", count(DISTINCT "runId")::int AS runs FROM "flow_run_step"
      WHERE "campaignId" = ${campaignId} AND ${this.cidSql(t)} GROUP BY 1`;
    return Object.fromEntries(rows.map((r) => [r.nodeId, Number(r.runs)]));
  }
  async activeRunsByNode(t: ID, campaignId: ID) {
    const g = await this.db.flowRun.groupBy({
      by: ['currentNodeId'], where: { campaignId, clienteId: this.cid(t), status: { in: ACTIVE_RUN } }, _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const r of g) if (r.currentNodeId) out[r.currentNodeId] = r._count._all;
    return out;
  }

  // ===========================================================================
  // Mensagens
  // ===========================================================================

  private toMessage(m: Prisma.MessageGetPayload<object>): Message {
    return {
      id: m.id, tenantId: this.scope(m.clienteId), phoneNumberId: m.numeroId, contactId: m.leadId, phoneE164: m.phone,
      direction: m.direction as Message['direction'], waMessageId: m.waMessageId, type: m.type, payload: m.payload, preview: m.preview,
      status: m.status as MessageStatus, statusRank: m.statusRank, campaignId: m.campaignId, flowRunId: m.flowRunId, nodeId: m.nodeId,
      bizOpaqueCallbackData: m.bizOpaqueCallbackData, errorCode: m.errorCode, errorTitle: m.errorTitle,
      pricingCategory: m.pricingCategory, pricingType: m.pricingType, createdAt: m.createdAt.getTime(),
      sentAt: ms(m.sentAt), deliveredAt: ms(m.deliveredAt), readAt: ms(m.readAt), failedAt: ms(m.failedAt),
    };
  }
  private messageData(m: Message) {
    return {
      waMessageId: m.waMessageId, status: m.status, statusRank: m.statusRank, errorCode: m.errorCode, errorTitle: m.errorTitle,
      pricingCategory: m.pricingCategory, pricingType: m.pricingType,
      sentAt: d(m.sentAt), deliveredAt: d(m.deliveredAt), readAt: d(m.readAt), failedAt: d(m.failedAt),
    };
  }

  async insertMessage(m: Message) {
    await this.db.message.create({
      data: {
        id: m.id, clienteId: this.cid(m.tenantId), numeroId: m.phoneNumberId, leadId: m.contactId, phone: m.phoneE164,
        direction: m.direction, type: m.type, payload: json(m.payload ?? {}), preview: m.preview, campaignId: m.campaignId,
        flowRunId: m.flowRunId, nodeId: m.nodeId, bizOpaqueCallbackData: m.bizOpaqueCallbackData, createdAt: new Date(m.createdAt),
        ...this.messageData(m),
      },
    });
  }
  async updateMessage(m: Message) {
    await this.db.message.update({ where: { id: m.id }, data: this.messageData(m) });
  }
  async getMessageByWaId(t: ID, waMessageId: string) {
    const m = await this.db.message.findFirst({ where: { waMessageId, clienteId: this.cid(t) } });
    return m ? this.toMessage(m) : null;
  }
  async listMessagesByPhone(t: ID, phone: string, limit: number) {
    const rows = await this.db.message.findMany({ where: { clienteId: this.cid(t), phone }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((m) => this.toMessage(m));
  }
  async recordStatusEvent(_t: ID, waMessageId: string, status: string) {
    const r = await this.db.messageStatusEvent.createMany({ data: [{ waMessageId, status }], skipDuplicates: true });
    return r.count === 1;
  }
  /** Contatos únicos que receberam modelo desde `since`, somando todos os números da BM (limite é do portfólio). */
  async countBusinessInitiatedRecipients(businessAccountId: ID, since: number) {
    const numeros = await this.db.numero.findMany({ where: { bmId: businessAccountId || null }, select: { id: true } });
    if (!numeros.length) return new Set<string>();
    const rows = await this.db.message.findMany({
      where: { numeroId: { in: numeros.map((n) => n.id) }, direction: 'out', type: 'template', createdAt: { gte: new Date(since) } },
      select: { phone: true }, distinct: ['phone'],
    });
    return new Set<string>(rows.map((r) => r.phone));
  }

  // ===========================================================================
  // Janela de 24 h
  // ===========================================================================

  async getWindow(_t: ID, numeroId: ID, phone: string) {
    const w = await this.db.serviceWindow.findUnique({ where: { numeroId_phone: { numeroId, phone } } });
    return ms(w?.lastInboundAt);
  }
  async touchWindow(_t: ID, numeroId: ID, phone: string, at: number) {
    const when = new Date(at);
    await this.db.serviceWindow.upsert({
      where: { numeroId_phone: { numeroId, phone } },
      create: { numeroId, phone, lastInboundAt: when },
      update: { lastInboundAt: when },
    });
  }
}
