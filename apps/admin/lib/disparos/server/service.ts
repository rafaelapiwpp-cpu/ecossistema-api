/**
 * DisparosService — regras de negócio de fluxos, campanhas, blacklist e webhooks.
 * Independe do provedor (mock/Meta) e do banco (memória/Postgres).
 */
import { FlowGraph, getNode, stepNumbers } from '../domain/flow-types';
import { validateFlow } from '../domain/flow-validate';
import {
  EngineEvent, RunState, TERMINAL_RUN, advance, decodeButtonPayload,
} from '../domain/flow-engine';
import { isOptOutText } from '../domain/optout';
import { blankGraph, confirmationGraph } from '../domain/flow-presets';
import { MetaWebhookPayload, parseMetaWebhook } from '../whatsapp/meta-webhook';
import {
  InboundEvent, META_ERRORS, STATUS_RANK, StatusEvent, WhatsAppApiError, WhatsAppProvider,
} from '../whatsapp/types';
import type { DisparosRepo } from './repo';
import {
  Audience, Campaign, CampaignStats, ConsentSource, Contact, Flow, FlowRun, FunnelRow, ID, Message, OptOut, OptOutSource,
  PhoneNumber, Recipient, RecipientStatus, TIER_LIMIT,
} from './entities';

/** Origens de opt-in aceitas na importação (o operador declara de onde veio). */
export const IMPORT_CONSENT_SOURCES: ConsentSource[] = ['web_form', 'checkout', 'whatsapp_inbound', 'import', 'api', 'admin'];
/** Contatos de exemplo usam DDD 00 (não existe): nunca chegam a um telefone real. */
export const SAMPLE_TAG = 'exemplo';

export interface Clock { now(): number }

export interface ServiceSettings {
  /** Resposta automática quando alguém escreve SAIR/PARAR. null = não responder. */
  optOutConfirmationText: string | null;
  extraOptOutKeywords: string[];
  maxSendAttempts: number;
}

export interface ServiceDeps {
  repo: DisparosRepo;
  provider: WhatsAppProvider;
  clock: Clock;
  settings?: Partial<ServiceSettings>;
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: unknown) {
    super(message);
  }
}

const DAY = 24 * 3600 * 1000;
const WINDOW_MS = DAY;
const uid = () => crypto.randomUUID();

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let e164: string;
  if (input.trim().startsWith('+')) e164 = `+${digits}`;
  else if (digits.length === 10 || digits.length === 11) e164 = `+55${digits}`;       // DDD + número
  else if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) e164 = `+${digits}`;
  else e164 = `+${digits}`;
  return /^\+\d{10,15}$/.test(e164) ? e164 : null;
}

export class DisparosService {
  private readonly repo: DisparosRepo;
  private readonly provider: WhatsAppProvider;
  private readonly clock: Clock;
  readonly settings: ServiceSettings;
  private readonly graphCache = new Map<ID, FlowGraph>();

  constructor(deps: ServiceDeps) {
    this.repo = deps.repo;
    this.provider = deps.provider;
    this.clock = deps.clock;
    this.settings = {
      optOutConfirmationText: 'Pronto, você não vai mais receber nossas mensagens automáticas.',
      extraOptOutKeywords: [],
      maxSendAttempts: 3,
      ...deps.settings,
    };
  }

  get providerKind() { return this.provider.kind; }
  now() { return this.clock.now(); }

  // ===========================================================================
  // Catálogo
  // ===========================================================================

  async listPhoneNumbers(t: ID) {
    const numbers = await this.repo.listPhoneNumbers(t);
    return Promise.all(numbers.map(async (p) => ({ ...p, messagingLimit: await this.messagingLimit(t, p) })));
  }

  async listTemplates(t: ID) {
    return (await this.repo.listTemplates(t)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listTags(t: ID) { return this.repo.listTags(t); }

  private async messagingLimit(t: ID, pn: PhoneNumber) {
    const ba = await this.repo.getBusinessAccount(t, pn.businessAccountId);
    const tier = ba?.messagingLimitTier ?? 'TIER_250';
    const limit = TIER_LIMIT[tier];
    const used = (await this.repo.countBusinessInitiatedRecipients(pn.businessAccountId, this.now() - DAY)).size;
    return { tier, limit: Number.isFinite(limit) ? limit : null, used, remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : null };
  }

  // ===========================================================================
  // Fluxos
  // ===========================================================================

  async listFlows(t: ID) {
    const flows = await this.repo.listFlows(t);
    return Promise.all(flows.map(async (f) => {
      const v = f.publishedVersionId ? await this.repo.getFlowVersion(t, f.publishedVersionId) : null;
      const validation = validateFlow(f.draftGraph);
      return {
        id: f.id, name: f.name, description: f.description, status: f.status, updatedAt: f.updatedAt,
        publishedVersion: v?.version ?? null,
        hasUnpublishedChanges: !!v && JSON.stringify(v.graph) !== JSON.stringify(f.draftGraph),
        steps: f.draftGraph.nodes.filter((n) => n.type !== 'start').length,
        errors: validation.issues.filter((i) => i.severity === 'error').length,
        nodeTypes: [...new Set(f.draftGraph.nodes.map((n) => n.type).filter((x) => x !== 'start'))],
      };
    }));
  }

  async getFlow(t: ID, id: ID) {
    const f = await this.repo.getFlow(t, id);
    if (!f) throw new HttpError(404, 'Fluxo não encontrado.');
    const v = f.publishedVersionId ? await this.repo.getFlowVersion(t, f.publishedVersionId) : null;
    return {
      flow: f,
      publishedVersion: v?.version ?? null,
      hasUnpublishedChanges: !!v && JSON.stringify(v.graph) !== JSON.stringify(f.draftGraph),
      validation: validateFlow(f.draftGraph),
    };
  }

  async createFlow(t: ID, input: { name: string; preset?: 'blank' | 'confirmation' }) {
    const name = input.name?.trim();
    if (!name) throw new HttpError(422, 'Dê um nome ao fluxo.');
    const now = this.now();
    const flow: Flow = {
      id: uid(), tenantId: t, name, description: null, status: 'draft',
      draftGraph: input.preset === 'confirmation' ? confirmationGraph() : blankGraph(),
      publishedVersionId: null, createdAt: now, updatedAt: now,
    };
    await this.repo.insertFlow(flow);
    return flow;
  }

  async saveFlow(t: ID, id: ID, input: { name?: string; graph?: FlowGraph }) {
    const f = await this.repo.getFlow(t, id);
    if (!f) throw new HttpError(404, 'Fluxo não encontrado.');
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new HttpError(422, 'Dê um nome ao fluxo.');
      f.name = input.name.trim();
    }
    if (input.graph) {
      if (!Array.isArray(input.graph.nodes) || !Array.isArray(input.graph.edges)) throw new HttpError(422, 'Grafo inválido.');
      f.draftGraph = input.graph;
    }
    f.updatedAt = this.now();
    await this.repo.updateFlow(f);
    return this.getFlow(t, id);
  }

  async publishFlow(t: ID, id: ID) {
    const f = await this.repo.getFlow(t, id);
    if (!f) throw new HttpError(404, 'Fluxo não encontrado.');
    const validation = validateFlow(f.draftGraph);
    if (!validation.canPublish) throw new HttpError(422, 'Corrija os erros antes de publicar.', validation);
    const version = (await this.repo.latestVersionNumber(t, id)) + 1;
    const v = { id: uid(), tenantId: t, flowId: id, version, graph: structuredClone(f.draftGraph), publishedAt: this.now() };
    await this.repo.insertFlowVersion(v);
    f.publishedVersionId = v.id;
    f.status = 'published';
    f.updatedAt = this.now();
    await this.repo.updateFlow(f);
    return this.getFlow(t, id);
  }

  private async versionGraph(t: ID, versionId: ID): Promise<FlowGraph> {
    const cached = this.graphCache.get(versionId);
    if (cached) return cached;
    const v = await this.repo.getFlowVersion(t, versionId);
    if (!v) throw new HttpError(404, 'Versão do fluxo não encontrada.');
    this.graphCache.set(versionId, v.graph);
    return v.graph;
  }

  // ===========================================================================
  // Blacklist
  // ===========================================================================

  async listOptOuts(t: ID, opts: { search?: string; includeRevoked?: boolean } = {}) {
    return this.repo.listOptOuts(t, opts);
  }

  async addOptOutManual(t: ID, input: { phone: string; reason?: string }) {
    const phone = normalizePhone(input.phone ?? '');
    if (!phone) throw new HttpError(422, 'Telefone inválido. Use DDD + número, ex.: 51 99999-0000.');
    return this.optOutPhone(t, phone, { source: 'manual', reason: input.reason?.trim() || 'Incluído manualmente' });
  }

  async revokeOptOut(t: ID, id: ID, reason: string) {
    if (!reason?.trim()) throw new HttpError(422, 'Registre como o contato pediu para voltar a receber (consentimento).');
    const o = await this.repo.revokeOptOut(t, id, reason.trim(), this.now());
    if (!o) throw new HttpError(404, 'Registro não encontrado ou já removido.');
    return o;
  }

  /** Coloca o telefone na blacklist e encerra TODAS as execuções ativas dele. */
  private async optOutPhone(
    t: ID, phone: string,
    info: { source: OptOutSource; reason?: string; triggerText?: string; campaignId?: ID | null; runId?: ID | null; waMessageId?: string | null },
    exceptRunId?: ID,
  ): Promise<OptOut> {
    const contact = await this.repo.getContactByPhone(t, phone);
    const saved = await this.repo.insertOptOut({
      id: uid(), tenantId: t, phoneE164: phone, contactId: contact?.id ?? null, contactName: contact?.name ?? null,
      source: info.source, reason: info.reason ?? null, triggerText: info.triggerText ?? null,
      campaignId: info.campaignId ?? null, flowRunId: info.runId ?? null, waMessageId: info.waMessageId ?? null,
      createdAt: this.now(), revokedAt: null, revokeReason: null,
    });
    for (const run of await this.repo.listActiveRunsByPhone(t, phone)) {
      if (run.id === exceptRunId) continue;
      if (run.currentNodeId) {
        const g = await this.versionGraph(t, run.flowVersionId);
        const node = getNode(g, run.currentNodeId);
        await this.repo.insertStep({
          tenantId: t, runId: run.id, campaignId: run.campaignId, nodeId: run.currentNodeId,
          nodeType: node?.type ?? 'unknown', outcome: 'opted_out', messageId: null, detail: { source: info.source }, createdAt: this.now(),
        });
      }
      run.status = 'opted_out';
      run.wakeAt = null;
      run.finishedAt = this.now();
      run.updatedAt = this.now();
      await this.repo.updateRun(run);
    }
    return saved;
  }

  // ===========================================================================
  // Contatos e consentimento
  // ===========================================================================

  async listContacts(t: ID, opts: { search?: string; consent?: string; tag?: string; page?: number }) {
    const pageSize = 50;
    const page = Math.max(1, opts.page ?? 1);
    const consent = (['opted_in', 'opted_out', 'unknown'] as const).find((c) => c === opts.consent);
    const [list, counts] = await Promise.all([
      this.repo.listContacts(t, { search: opts.search, consent, tag: opts.tag || undefined, offset: (page - 1) * pageSize, limit: pageSize }),
      this.repo.consentCounts(t),
    ]);
    return { ...list, page, pageSize, counts };
  }

  /**
   * Importa contatos COM opt-in declarado. Regras:
   *  - o operador diz de onde veio o consentimento (origem + descrição); sem isso, nada entra;
   *  - quem está em opt-out continua em opt-out (importar nunca reativa ninguém);
   *  - cada opt-in novo vira um ConsentEvent (log imutável).
   */
  async importContacts(t: ID, input: { text: string; tags?: string[]; consentSource: string; consentNote: string }) {
    const source = IMPORT_CONSENT_SOURCES.find((s) => s === input.consentSource);
    if (!source) throw new HttpError(422, 'Escolha a origem do consentimento.');
    const note = input.consentNote?.trim();
    if (!note) throw new HttpError(422, 'Descreva como esses contatos deram o opt-in (ex.: formulário do site, out/2026).');
    const tags = [...new Set((input.tags ?? []).map((x) => x.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))];
    const lines = (input.text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new HttpError(422, 'Cole pelo menos uma linha: telefone, nome.');
    if (lines.length > 5000) throw new HttpError(422, 'Máximo de 5.000 linhas por importação.');

    const now = this.now();
    const out = { created: 0, updated: 0, keptOptOut: 0, invalid: 0, duplicates: 0 };
    const seen = new Set<string>();
    for (const line of lines) {
      const [rawPhone, ...rest] = line.split(/[;,\t]/);
      const phone = normalizePhone(rawPhone ?? '');
      if (!phone) { if (/\d/.test(rawPhone ?? '')) out.invalid++; continue; }   // linha sem dígitos = cabeçalho
      if (seen.has(phone)) { out.duplicates++; continue; }
      seen.add(phone);
      const name = rest.join(' ').trim();
      const existing = await this.repo.getContactByPhone(t, phone);
      if (existing) {
        existing.tags = [...new Set([...existing.tags, ...tags])];
        if (!existing.name && name) existing.name = name;
        if (existing.consent === 'opted_out') out.keptOptOut++;
        else if (existing.consent !== 'opted_in') {
          existing.consent = 'opted_in'; existing.consentSource = source; existing.consentAt = now;
          await this.repo.insertConsentEvent(this.consentEvent(t, existing.id, phone, 'opted_in', source, note, now));
          out.updated++;
        } else out.updated++;
        await this.repo.updateContact(existing);
        continue;
      }
      const c: Contact = {
        id: uid(), tenantId: t, name: name || '', phoneE164: phone, tags, attributes: {},
        consent: 'opted_in', consentSource: source, consentAt: now, createdAt: now,
      };
      await this.repo.insertContact(c);
      await this.repo.insertConsentEvent(this.consentEvent(t, c.id, phone, 'opted_in', source, note, now));
      out.created++;
    }
    return out;
  }

  /** Contatos fictícios (DDD 00) para testar a simulação. Bloqueado com a Meta ligada. */
  async addSampleContacts(t: ID) {
    if (this.provider.kind !== 'mock') throw new HttpError(409, 'Contatos de exemplo só existem no modo simulação.');
    const first = ['Ana', 'Bruno', 'Camila', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Lucas', 'Mariana', 'Mateus', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Renata', 'Rodrigo'];
    const last = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Costa', 'Ribeiro', 'Martins', 'Rocha', 'Almeida'];
    const days = ['seg, 9/11', 'ter, 10/11', 'qua, 11/11', 'qui, 12/11', 'sex, 13/11'];
    const lines: string[] = [];
    for (let i = 0; i < 120; i++) lines.push(`+55009${String(10000000 + i * 7919).slice(-8)}, ${first[i % first.length]} ${last[(i * 7) % last.length]}`);
    const r = await this.importContacts(t, {
      text: lines.join('\n'), tags: [SAMPLE_TAG, 'consultas-semana'], consentSource: 'admin',
      consentNote: 'Contatos fictícios de exemplo (DDD 00) para testar a simulação. Nunca recebem mensagem real.',
    });
    // atributos para as variáveis dos modelos de exemplo
    for (let i = 0; i < lines.length; i++) {
      const phone = normalizePhone(lines[i]?.split(',')[0] ?? '');
      if (!phone) continue;
      const c = await this.repo.getContactByPhone(t, phone);
      if (c && !c.attributes.data_consulta) { c.attributes = { ...c.attributes, data_consulta: `${days[i % days.length]} às ${9 + (i % 8)}h` }; await this.repo.updateContact(c); }
    }
    return r;
  }

  private consentEvent(t: ID, contactId: ID | null, phone: string, status: 'opted_in' | 'opted_out', source: ConsentSource, note: string | null, at: number) {
    return {
      id: uid(), tenantId: t, contactId, phoneE164: phone, status, source, note, keyword: null, waMessageId: null,
      campaignId: null, flowRunId: null, createdAt: at,
    };
  }

  // ===========================================================================
  // Campanhas
  // ===========================================================================

  async audiencePreview(t: ID, input: { phoneNumberId: ID; audience: Audience }) {
    const pn = await this.repo.getPhoneNumber(t, input.phoneNumberId);
    if (!pn) throw new HttpError(422, 'Escolha o número que vai enviar.');
    const snap = await this.snapshotAudience(t, input.audience);
    return {
      total: snap.total,
      eligible: snap.eligible.length,
      optedOut: snap.optedOut.length,
      noConsent: snap.noConsent.length,
      invalid: snap.invalid.length,
      duplicates: snap.duplicates,
      messagingLimit: await this.messagingLimit(t, pn),
    };
  }

  private async snapshotAudience(t: ID, audience: Audience) {
    const contacts = await this.repo.listContactsByAudience(t, audience.tags ?? [], !!audience.all);
    const blocked = await this.repo.activeOptOutPhones(t);
    const seen = new Set<string>();
    const eligible: { contact: typeof contacts[0]; phone: string }[] = [];
    const optedOut: { contact: typeof contacts[0]; phone: string }[] = [];
    const noConsent: { contact: typeof contacts[0]; phone: string }[] = [];
    const invalid: typeof contacts = [];
    let duplicates = 0;
    for (const c of contacts) {
      const phone = normalizePhone(c.phoneE164);
      // exemplo (DDD 00) só existe na simulação; com a Meta ligada é número inválido
      if (!phone || (this.provider.kind === 'meta' && c.tags.includes(SAMPLE_TAG))) { invalid.push(c); continue; }
      if (seen.has(phone)) { duplicates++; continue; }
      seen.add(phone);
      // Opt-out vence sempre. Sem opt-in registrado não há disparo (disparo não solicitado está fora de escopo).
      if (blocked.has(phone) || c.consent === 'opted_out') optedOut.push({ contact: c, phone });
      else if (c.consent !== 'opted_in') noConsent.push({ contact: c, phone });
      else eligible.push({ contact: c, phone });
    }
    return { total: contacts.length, eligible, optedOut, noConsent, invalid, duplicates };
  }

  async createCampaign(t: ID, input: {
    name: string; phoneNumberId: ID; flowId: ID; audience: Audience;
    ratePerMinute?: number; scheduledAt?: number | null; startNow?: boolean;
  }) {
    const name = input.name?.trim();
    if (!name) throw new HttpError(422, 'Dê um nome à campanha.');
    const pn = await this.repo.getPhoneNumber(t, input.phoneNumberId);
    if (!pn) throw new HttpError(422, 'Escolha o número que vai enviar.');
    if (!pn.canSend) throw new HttpError(422, `O número ${pn.displayPhoneNumber} não está apto a enviar (status "${pn.status}" ou qualidade baixa). Ajuste em Números.`);
    const flow = await this.repo.getFlow(t, input.flowId);
    if (!flow?.publishedVersionId) throw new HttpError(422, 'Escolha um fluxo publicado.');
    if (!input.audience?.all && !input.audience?.tags?.length) throw new HttpError(422, 'Escolha pelo menos uma tag de público.');
    const rate = Math.round(input.ratePerMinute ?? 60);
    if (rate < 1 || rate > 6000) throw new HttpError(422, 'Velocidade entre 1 e 6.000 por minuto.');
    const now = this.now();
    if (input.scheduledAt && input.scheduledAt < now - 60_000) throw new HttpError(422, 'O agendamento está no passado.');

    const snap = await this.snapshotAudience(t, input.audience);
    if (!snap.eligible.length) throw new HttpError(422, 'Nenhum contato elegível nesse público: só recebe quem tem opt-in registrado e não está na blacklist.');

    const c: Campaign = {
      id: uid(), tenantId: t, name, phoneNumberId: pn.id, flowId: flow.id, flowVersionId: flow.publishedVersionId,
      status: input.startNow ? 'running' : input.scheduledAt ? 'scheduled' : 'draft',
      pauseReason: null, blockedReason: null, audience: input.audience, ratePerMinute: rate,
      totalRecipients: snap.eligible.length + snap.optedOut.length + snap.noConsent.length + snap.invalid.length,
      scheduledAt: input.scheduledAt ?? null, startedAt: input.startNow ? now : null, finishedAt: null,
      lastDispatchAt: null, createdAt: now, updatedAt: now,
    };
    await this.repo.insertCampaign(c);

    const base = (status: RecipientStatus, contact: typeof snap.eligible[0]['contact'], phone: string): Recipient => ({
      id: uid(), tenantId: t, campaignId: c.id, contactId: contact.id, phoneE164: phone, name: contact.name,
      variables: { ...contact.attributes }, status, attempts: 0, flowRunId: null, waMessageId: null,
      errorCode: null, errorTitle: null, acceptedAt: null, sentAt: null, deliveredAt: null, readAt: null, failedAt: null, updatedAt: now,
    });
    await this.repo.insertRecipients([
      ...snap.eligible.map((e) => base('pending', e.contact, e.phone)),
      ...snap.optedOut.map((e) => base('skipped_optout', e.contact, e.phone)),
      ...snap.noConsent.map((e) => base('skipped_no_consent', e.contact, e.phone)),
      ...snap.invalid.map((c2) => base('skipped_invalid', c2, c2.phoneE164)),
    ]);
    return c;
  }

  async campaignAction(t: ID, id: ID, action: 'start' | 'pause' | 'resume' | 'cancel') {
    const c = await this.repo.getCampaign(t, id);
    if (!c) throw new HttpError(404, 'Campanha não encontrada.');
    const now = this.now();
    const bad = () => new HttpError(409, `Não dá para ${({ start: 'iniciar', pause: 'pausar', resume: 'retomar', cancel: 'cancelar' })[action]} uma campanha ${c.status}.`);
    switch (action) {
      case 'start':
        if (c.status !== 'draft' && c.status !== 'scheduled') throw bad();
        c.status = 'running'; c.startedAt = now; c.lastDispatchAt = now;
        break;
      case 'pause':
        if (c.status !== 'running' && c.status !== 'scheduled') throw bad();
        c.status = 'paused'; c.pauseReason = 'manual';
        break;
      case 'resume':
        if (c.status !== 'paused') throw bad();
        c.status = 'running'; c.pauseReason = null; c.startedAt ??= now; c.lastDispatchAt = now;
        break;
      case 'cancel':
        if (['completed', 'canceled'].includes(c.status)) throw bad();
        c.status = 'canceled'; c.finishedAt = now;
        await this.cancelCampaignRuns(t, c.id);
        break;
    }
    c.updatedAt = now;
    await this.repo.updateCampaign(c);
    return c;
  }

  private async cancelCampaignRuns(t: ID, campaignId: ID) {
    const { rows } = await this.repo.listRecipients(t, campaignId, { offset: 0, limit: 1e9 });
    const runIds = rows.map((r) => r.flowRunId).filter((x): x is ID => !!x);
    for (const run of await this.repo.listRunsByIds(t, runIds)) {
      if (TERMINAL_RUN.has(run.status)) continue;
      run.status = 'canceled'; run.wakeAt = null; run.finishedAt = this.now(); run.updatedAt = this.now();
      await this.repo.updateRun(run);
    }
  }

  async campaignStats(t: ID, c: Campaign): Promise<CampaignStats> {
    const s = await this.repo.countRecipientsByStatus(t, c.id);
    const p = await this.repo.campaignProgress(t, c.id);
    const total = Object.values(s).reduce((a, b) => a + b, 0);
    return {
      total,
      queued: s.pending + s.processing,
      sent: s.accepted + s.sent + s.delivered + s.read,
      delivered: s.delivered + s.read,
      read: s.read,
      failed: s.failed,
      skipped: s.skipped_optout + s.skipped_no_consent + s.skipped_invalid,
      skippedOptout: s.skipped_optout,
      skippedNoConsent: s.skipped_no_consent,
      inProgress: p.inProgress,
      finished: p.finished,
      optedOutDuringFlow: p.optedOutDuringFlow,
      percentDone: total ? Math.round((p.finished / total) * 1000) / 10 : 0,
    };
  }

  async listCampaigns(t: ID) {
    const [campaigns, numbers, flows] = await Promise.all([this.repo.listCampaigns(t), this.repo.listPhoneNumbers(t), this.repo.listFlows(t)]);
    return Promise.all(campaigns.map(async (c) => ({
      campaign: c,
      stats: await this.campaignStats(t, c),
      flowName: flows.find((f) => f.id === c.flowId)?.name ?? '—',
      phone: numbers.find((n) => n.id === c.phoneNumberId)?.displayPhoneNumber ?? '—',
    })));
  }

  async getCampaign(t: ID, id: ID) {
    const c = await this.repo.getCampaign(t, id);
    if (!c) throw new HttpError(404, 'Campanha não encontrada.');
    const [pn, flow, version] = await Promise.all([
      this.repo.getPhoneNumber(t, c.phoneNumberId), this.repo.getFlow(t, c.flowId), this.repo.getFlowVersion(t, c.flowVersionId),
    ]);
    const graph = version?.graph ?? { nodes: [], edges: [] };
    return {
      campaign: c,
      stats: await this.campaignStats(t, c),
      funnel: await this.funnel(t, c.id, graph),
      liveByNode: await this.repo.activeRunsByNode(t, c.id),
      flow: { id: c.flowId, name: flow?.name ?? '—', version: version?.version ?? null, graph },
      phone: pn,
      messagingLimit: pn ? await this.messagingLimit(t, pn) : null,
      providerKind: this.provider.kind,
    };
  }

  private async funnel(t: ID, campaignId: ID, graph: FlowGraph): Promise<FunnelRow[]> {
    const [agg, reached] = await Promise.all([this.repo.aggregateSteps(t, campaignId), this.repo.reachedByNode(t, campaignId)]);
    const steps = stepNumbers(graph);
    return graph.nodes
      .filter((n) => n.type !== 'start')
      .sort((a, b) => (steps.get(a.id) ?? 0) - (steps.get(b.id) ?? 0))
      .map((n) => ({
        nodeId: n.id,
        reached: reached[n.id] ?? 0,
        outcomes: Object.fromEntries(agg.filter((a) => a.nodeId === n.id).map((a) => [a.outcome, a.runs])),
      }));
  }

  async listRecipients(t: ID, campaignId: ID, opts: { filter?: string; search?: string; page?: number; pageSize?: number }) {
    const groups: Record<string, RecipientStatus[]> = {
      all: [],
      queued: ['pending', 'processing'],
      sent: ['accepted', 'sent'],
      delivered: ['delivered'],
      read: ['read'],
      failed: ['failed'],
      skipped: ['skipped_optout', 'skipped_no_consent', 'skipped_invalid'],
    };
    const pageSize = Math.min(100, opts.pageSize ?? 25);
    const page = Math.max(1, opts.page ?? 1);
    const { rows, total } = await this.repo.listRecipients(t, campaignId, {
      statuses: groups[opts.filter ?? 'all'] ?? [], search: opts.search, offset: (page - 1) * pageSize, limit: pageSize,
    });
    const runs = await this.repo.listRunsByIds(t, rows.map((r) => r.flowRunId).filter((x): x is ID => !!x));
    const byId = new Map(runs.map((r) => [r.id, r]));
    return {
      total, page, pageSize,
      rows: rows.map((r) => {
        const run = r.flowRunId ? byId.get(r.flowRunId) : undefined;
        return { ...r, run: run ? { status: run.status, currentNodeId: run.currentNodeId, wakeAt: run.wakeAt, answers: run.context.answers, lastError: run.lastError } : null };
      }),
    };
  }

  async conversation(t: ID, phone: string) {
    const p = normalizePhone(phone);
    if (!p) throw new HttpError(422, 'Telefone inválido.');
    const [messages, optOut, contact] = await Promise.all([
      this.repo.listMessagesByPhone(t, p, 80),
      this.repo.getActiveOptOut(t, p),
      this.repo.getContactByPhone(t, p),
    ]);
    return { phone: p, name: contact?.name ?? null, messages, optOut };
  }

  // ===========================================================================
  // Worker: chamado em intervalo (cron / fila). Idempotente.
  // ===========================================================================

  async tick() {
    const now = this.now();
    let dispatched = 0;
    for (const c of await this.repo.listCampaignsByStatus(['scheduled'])) {
      if (c.scheduledAt !== null && c.scheduledAt <= now) {
        c.status = 'running'; c.startedAt = now; c.lastDispatchAt = now; c.updatedAt = now;
        await this.repo.updateCampaign(c);
      }
    }
    for (const c of await this.repo.listCampaignsByStatus(['running'])) {
      dispatched += await this.dispatchCampaign(c);
    }
    const woke = await this.wakeRuns();
    for (const c of await this.repo.listCampaignsByStatus(['running'])) {
      const s = await this.campaignStats(c.tenantId, c);
      if (s.queued === 0 && s.inProgress === 0) {
        c.status = 'completed'; c.finishedAt = this.now(); c.blockedReason = null; c.updatedAt = this.now();
        await this.repo.updateCampaign(c);
      }
    }
    return { dispatched, woke };
  }

  private async dispatchCampaign(c: Campaign): Promise<number> {
    const t = c.tenantId;
    const now = this.now();
    const last = Math.max(c.lastDispatchAt ?? c.startedAt ?? now, now - 60_000);
    let allowance = Math.floor(((now - last) * c.ratePerMinute) / 60_000);
    if (allowance <= 0) return 0;
    allowance = Math.min(allowance, 500);

    const pn = await this.repo.getPhoneNumber(t, c.phoneNumberId);
    if (!pn) return 0;
    const limit = await this.messagingLimit(t, pn);
    const budget = limit.remaining === null ? allowance : Math.min(allowance, limit.remaining);
    c.blockedReason = budget <= 0 ? 'messaging_limit' : null;

    const batch = budget > 0 ? await this.repo.claimPending(t, c.id, budget) : [];
    const blocked = await this.repo.activeOptOutPhones(t);
    const graph = await this.versionGraph(t, c.flowVersionId);

    for (const r of batch) {
      if (blocked.has(r.phoneE164)) {           // entrou na blacklist depois da criação
        r.status = 'skipped_optout'; r.updatedAt = now;
        await this.repo.updateRecipient(r);
        continue;
      }
      const runId = uid();
      const firstName = r.name.split(' ')[0] ?? '';
      const run: FlowRun = {
        id: runId, tenantId: t, flowId: c.flowId, flowVersionId: c.flowVersionId,
        campaignId: c.id, campaignRecipientId: r.id, phoneNumberId: pn.id, contactId: r.contactId, phoneE164: r.phoneE164,
        status: 'active', currentNodeId: null, wakeAt: null,
        context: { vars: { nome: firstName, nome_completo: r.name, telefone: r.phoneE164, ...r.variables }, answers: {} },
        stepCount: 0, lastError: null, startedAt: now, finishedAt: null, updatedAt: now,
      };
      await this.repo.insertRun(run);
      r.flowRunId = runId;
      r.attempts += 1;
      await this.repo.updateRecipient(r);

      const res = await this.runEngine(run, graph, { kind: 'start' });
      const fresh = (await this.repo.getRecipient(t, r.id))!;
      if (res.error) {
        if (res.error.retryable && fresh.attempts < this.settings.maxSendAttempts) {
          fresh.status = 'pending'; fresh.flowRunId = null;
        } else {
          fresh.status = 'failed'; fresh.errorCode = res.error.code; fresh.errorTitle = res.error.title; fresh.failedAt = now;
        }
        fresh.updatedAt = now;
        await this.repo.updateRecipient(fresh);
      }
    }

    c.lastDispatchAt = batch.length >= allowance ? last + (allowance * 60_000) / c.ratePerMinute : now;
    c.updatedAt = now;
    await this.repo.updateCampaign(c);
    return batch.length;
  }

  private async wakeRuns(): Promise<number> {
    const due = await this.repo.listDueRuns(this.now(), 500);
    for (const run of due) {
      await this.runEngine(run, await this.versionGraph(run.tenantId, run.flowVersionId), { kind: 'wake' });
    }
    return due.length;
  }

  // ===========================================================================
  // Execução do motor + efeitos colaterais
  // ===========================================================================

  private async runEngine(run: FlowRun, graph: FlowGraph, event: EngineEvent): Promise<{ error: WhatsAppApiError | null }> {
    const t = run.tenantId;
    const now = this.now();
    const [optOut, lastInbound] = await Promise.all([
      this.repo.getActiveOptOut(t, run.phoneE164),
      this.repo.getWindow(t, run.phoneNumberId, run.phoneE164),
    ]);
    const prev: RunState = {
      id: run.id, status: run.status, currentNodeId: run.currentNodeId, wakeAt: run.wakeAt,
      vars: run.context.vars, answers: run.context.answers, stepCount: run.stepCount, lastError: run.lastError,
    };
    const { state, actions } = advance(graph, prev, event, {
      now, optedOut: !!optOut, windowOpenUntil: lastInbound !== null ? lastInbound + WINDOW_MS : null,
    });
    if (state === prev) return { error: null };

    const pn = (await this.repo.getPhoneNumber(t, run.phoneNumberId))!;
    let error: WhatsAppApiError | null = null;
    let failedNode: string | null = null;

    for (const a of actions) {
      if (error) break;
      if (a.type === 'step') {
        await this.repo.insertStep({
          tenantId: t, runId: run.id, campaignId: run.campaignId, nodeId: a.nodeId, nodeType: a.nodeType,
          outcome: a.outcome, messageId: null, detail: a.detail ?? null, createdAt: now,
        });
      } else if (a.type === 'optout') {
        await this.optOutPhone(t, run.phoneE164, {
          source: a.source, reason: a.reason, triggerText: a.triggerText, campaignId: run.campaignId, runId: run.id,
        }, run.id);
      } else {
        const msg: Message = {
          id: uid(), tenantId: t, phoneNumberId: run.phoneNumberId, contactId: run.contactId, phoneE164: run.phoneE164,
          direction: 'out', waMessageId: null, type: a.message.type === 'interactive_buttons' ? 'interactive' : a.message.type,
          payload: a.message, preview: a.preview, status: 'queued', statusRank: 0,
          campaignId: run.campaignId, flowRunId: run.id, nodeId: a.nodeId,
          bizOpaqueCallbackData: `run:${run.id}|node:${a.nodeId}`,
          errorCode: null, errorTitle: null, pricingCategory: null, pricingType: null,
          createdAt: now, sentAt: null, deliveredAt: null, readAt: null, failedAt: null,
        };
        await this.repo.insertMessage(msg);
        try {
          const res = await this.provider.send({
            phoneNumberId: pn.phoneNumberId, to: run.phoneE164, message: a.message, bizOpaqueCallbackData: msg.bizOpaqueCallbackData!,
          });
          msg.waMessageId = res.waMessageId; msg.status = 'accepted'; msg.statusRank = STATUS_RANK.accepted;
          await this.repo.updateMessage(msg);
          await this.markRecipientAccepted(run, res.waMessageId, now);
        } catch (e) {
          error = e instanceof WhatsAppApiError ? e : new WhatsAppApiError(0, (e as Error).message ?? 'Erro ao enviar', true);
          failedNode = a.nodeId;
          msg.status = 'failed'; msg.statusRank = STATUS_RANK.failed; msg.errorCode = error.code; msg.errorTitle = error.title; msg.failedAt = now;
          await this.repo.updateMessage(msg);
          await this.repo.insertStep({
            tenantId: t, runId: run.id, campaignId: run.campaignId, nodeId: a.nodeId, nodeType: a.nodeType,
            outcome: 'error', messageId: msg.id, detail: { code: error.code, title: error.title }, createdAt: now,
          });
        }
      }
    }

    const fresh = (await this.repo.getRun(t, run.id)) ?? run;
    if (TERMINAL_RUN.has(fresh.status) && fresh.status !== run.status) return { error }; // encerrada por fora (opt-out)
    fresh.status = error ? 'failed' : state.status;
    fresh.currentNodeId = error ? failedNode : state.currentNodeId;
    fresh.wakeAt = error ? null : state.wakeAt;
    fresh.context = { vars: state.vars, answers: state.answers };
    fresh.stepCount = state.stepCount;
    fresh.lastError = error ? `[${error.code}] ${error.title}` : state.lastError;
    fresh.updatedAt = now;
    if (TERMINAL_RUN.has(fresh.status)) fresh.finishedAt = now;
    await this.repo.updateRun(fresh);
    return { error };
  }

  private async markRecipientAccepted(run: FlowRun, waMessageId: string, now: number) {
    if (!run.campaignRecipientId) return;
    const r = await this.repo.getRecipient(run.tenantId, run.campaignRecipientId);
    if (!r || r.waMessageId) return;          // só a 1ª mensagem do contato conta para o disparo
    r.waMessageId = waMessageId;
    r.status = 'accepted';
    r.acceptedAt = now;
    r.updatedAt = now;
    await this.repo.updateRecipient(r);
  }

  // ===========================================================================
  // Webhook (Meta ou mock — mesmo formato)
  // ===========================================================================

  async handleWebhook(payload: MetaWebhookPayload) {
    const events = parseMetaWebhook(payload);
    for (const ev of events) {
      const pn = await this.repo.findPhoneNumberByMetaId(ev.phoneNumberId);
      if (!pn) continue;                       // número que não é nosso
      if (ev.kind === 'status') await this.handleStatus(pn, ev);
      else await this.handleInbound(pn, ev);
    }
    return { processed: events.length };
  }

  private async handleStatus(pn: PhoneNumber, ev: StatusEvent) {
    const t = pn.tenantId;
    if (!(await this.repo.recordStatusEvent(t, ev.waMessageId, ev.status))) return;   // duplicado
    const msg = await this.repo.getMessageByWaId(t, ev.waMessageId);
    if (!msg) return;

    const rank = STATUS_RANK[ev.status];
    if (ev.status === 'failed') {
      if (msg.statusRank < STATUS_RANK.delivered) {
        msg.status = 'failed'; msg.statusRank = rank; msg.failedAt = ev.timestamp;
        msg.errorCode = ev.error?.code ?? null; msg.errorTitle = ev.error?.title ?? null;
      }
    } else if (msg.status !== 'failed' && rank > msg.statusRank) {
      msg.status = ev.status; msg.statusRank = rank;
    }
    if (ev.status === 'sent') msg.sentAt ??= ev.timestamp;
    if (ev.status === 'delivered') msg.deliveredAt ??= ev.timestamp;
    if (ev.status === 'read') { msg.readAt ??= ev.timestamp; msg.deliveredAt ??= ev.timestamp; }   // read implica entregue
    if (ev.pricing) { msg.pricingCategory = ev.pricing.category ?? null; msg.pricingType = ev.pricing.type ?? null; }
    await this.repo.updateMessage(msg);

    const r = await this.repo.findRecipientByWaMessageId(t, ev.waMessageId);
    if (r) {
      const rRank: Record<string, number> = { pending: 0, processing: 0, accepted: 1, sent: 2, delivered: 3, read: 4 };
      if (ev.status === 'failed') {
        if ((rRank[r.status] ?? 9) < 3) {
          r.status = 'failed'; r.failedAt = ev.timestamp; r.errorCode = ev.error?.code ?? null; r.errorTitle = ev.error?.title ?? null;
        }
      } else if (ev.status !== 'played' && r.status !== 'failed' && STATUS_RANK[ev.status] > (rRank[r.status] ?? 0)) {
        r.status = ev.status as RecipientStatus;
      }
      if (ev.status === 'sent') r.sentAt ??= ev.timestamp;
      if (ev.status === 'delivered') r.deliveredAt ??= ev.timestamp;
      if (ev.status === 'read') { r.readAt ??= ev.timestamp; r.deliveredAt ??= ev.timestamp; }
      r.updatedAt = this.now();
      await this.repo.updateRecipient(r);
    }

    if (ev.status === 'failed') {
      if (ev.error?.code === META_ERRORS.MARKETING_OPTED_OUT) {
        await this.optOutPhone(t, msg.phoneE164, {
          source: 'meta_marketing_optout', reason: 'Parou marketing pelo próprio WhatsApp (131050)',
          campaignId: msg.campaignId, runId: msg.flowRunId, waMessageId: ev.waMessageId,
        });
      }
      if (msg.flowRunId) {
        const run = await this.repo.getRun(t, msg.flowRunId);
        if (run && !TERMINAL_RUN.has(run.status)) {
          await this.repo.insertStep({
            tenantId: t, runId: run.id, campaignId: run.campaignId, nodeId: msg.nodeId ?? run.currentNodeId ?? '?',
            nodeType: 'message', outcome: 'error', messageId: msg.id, detail: ev.error ?? null, createdAt: this.now(),
          });
          run.status = 'failed'; run.wakeAt = null; run.finishedAt = this.now(); run.updatedAt = this.now();
          run.lastError = ev.error ? `[${ev.error.code}] ${ev.error.title}` : 'Falha na entrega';
          await this.repo.updateRun(run);
        }
      }
    }
  }

  private async handleInbound(pn: PhoneNumber, ev: InboundEvent) {
    const t = pn.tenantId;
    if (await this.repo.getMessageByWaId(t, ev.waMessageId)) return;   // duplicado
    const contact = await this.repo.getContactByPhone(t, ev.from);
    await this.repo.insertMessage({
      id: uid(), tenantId: t, phoneNumberId: pn.id, contactId: contact?.id ?? null, phoneE164: ev.from,
      direction: 'in', waMessageId: ev.waMessageId, type: ev.type, payload: ev,
      preview: ev.buttonText ?? ev.text ?? `[${ev.type}]`, status: 'received', statusRank: 0,
      campaignId: null, flowRunId: null, nodeId: null, bizOpaqueCallbackData: null,
      errorCode: null, errorTitle: null, pricingCategory: null, pricingType: null,
      createdAt: ev.timestamp, sentAt: null, deliveredAt: null, readAt: null, failedAt: null,
    });
    await this.repo.touchWindow(t, pn.id, ev.from, ev.timestamp);

    // A qual execução esta resposta pertence?
    const decoded = decodeButtonPayload(ev.buttonPayload);
    let run: FlowRun | null = null;
    if (decoded) run = await this.repo.getRun(t, decoded.runId);
    else run = (await this.repo.listActiveRunsByPhone(t, ev.from)).find((r) => r.status === 'waiting_reply' && r.phoneNumberId === pn.id) ?? null;

    // 1) Opt-out por botão (vale mesmo se a mensagem for antiga)
    if (decoded && run) {
      const graph = await this.versionGraph(t, run.flowVersionId);
      const node = getNode(graph, decoded.nodeId);
      const button = node && (node.type === 'buttons' || node.type === 'template')
        ? node.data.buttons.find((b) => b.key === decoded.key) : undefined;
      if (button?.optOut) {
        if (run.status === 'waiting_reply' && run.currentNodeId === decoded.nodeId) {
          await this.runEngine(run, graph, { kind: 'reply', payload: ev.buttonPayload, text: ev.text });
        } else {
          await this.optOutPhone(t, ev.from, { source: 'button', reason: `Clicou em "${button.label}"`, triggerText: button.label, campaignId: run.campaignId, runId: run.id, waMessageId: ev.waMessageId });
        }
        return;
      }
    }

    // 2) Opt-out por palavra (SAIR, PARAR...) — vale para qualquer pessoa, em fluxo ou não
    if (!decoded && isOptOutText(ev.text, this.settings.extraOptOutKeywords)) {
      const already = await this.repo.getActiveOptOut(t, ev.from);
      await this.optOutPhone(t, ev.from, {
        source: 'keyword', reason: 'Pediu para sair', triggerText: ev.text, campaignId: run?.campaignId ?? null, runId: run?.id ?? null, waMessageId: ev.waMessageId,
      });
      if (!already && this.settings.optOutConfirmationText) await this.sendLoose(pn, ev.from, this.settings.optOutConfirmationText);
      return;
    }

    // 3) Resposta normal: segue o fluxo
    if (run && run.status === 'waiting_reply') {
      await this.runEngine(run, await this.versionGraph(t, run.flowVersionId), { kind: 'reply', payload: ev.buttonPayload, text: ev.text });
    }
  }

  /** Envio avulso (fora de fluxo) — usado só para confirmar o opt-out, com a janela recém-aberta. */
  private async sendLoose(pn: PhoneNumber, to: string, body: string) {
    const now = this.now();
    const msg: Message = {
      id: uid(), tenantId: pn.tenantId, phoneNumberId: pn.id, contactId: null, phoneE164: to, direction: 'out',
      waMessageId: null, type: 'text', payload: { type: 'text', body }, preview: body, status: 'queued', statusRank: 0,
      campaignId: null, flowRunId: null, nodeId: null, bizOpaqueCallbackData: 'optout_confirmation',
      errorCode: null, errorTitle: null, pricingCategory: null, pricingType: null,
      createdAt: now, sentAt: null, deliveredAt: null, readAt: null, failedAt: null,
    };
    await this.repo.insertMessage(msg);
    try {
      const res = await this.provider.send({ phoneNumberId: pn.phoneNumberId, to, message: { type: 'text', body }, bizOpaqueCallbackData: 'optout_confirmation' });
      msg.waMessageId = res.waMessageId; msg.status = 'accepted'; msg.statusRank = STATUS_RANK.accepted;
    } catch (e) {
      msg.status = 'failed'; msg.errorTitle = (e as Error).message;
    }
    await this.repo.updateMessage(msg);
  }
}
