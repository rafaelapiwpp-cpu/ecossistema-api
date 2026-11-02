/**
 * Repositório em memória para o modo mock. Mesmo contrato do PgRepo.
 * Os comentários em repo.ts dizem a query equivalente de cada método.
 */
import type { DisparosRepo } from './repo';
import type {
  BusinessAccount, Campaign, CampaignStatus, ConsentEvent, ConsentStatus, Contact, Flow, FlowRun, FlowVersion, ID, Message,
  OptOut, PhoneNumber, Recipient, RecipientStatus, RunStep, Template,
} from './entities';

const ACTIVE_RUN = new Set(['active', 'waiting_delay', 'waiting_reply']);
const clone = <T>(x: T): T => structuredClone(x);

export class MemoryRepo implements DisparosRepo {
  businessAccounts: BusinessAccount[] = [];
  phoneNumbers: PhoneNumber[] = [];
  templates: Template[] = [];
  contacts: Contact[] = [];
  optOuts: OptOut[] = [];
  consentEvents: ConsentEvent[] = [];
  flows = new Map<ID, Flow>();
  flowVersions = new Map<ID, FlowVersion>();
  campaigns = new Map<ID, Campaign>();
  recipients = new Map<ID, Recipient>();
  recipientsByCampaign = new Map<ID, ID[]>();
  recipientByWaId = new Map<string, ID>();
  runs = new Map<ID, FlowRun>();
  runsByPhone = new Map<string, ID[]>();
  steps: RunStep[] = [];
  messages = new Map<ID, Message>();
  messageByWaId = new Map<string, ID>();
  statusEvents = new Set<string>();
  windows = new Map<string, number>();
  private stepSeq = 0;

  // ---- contas ---------------------------------------------------------------
  async getBusinessAccount(t: ID, id: ID) { return clone(this.businessAccounts.find((b) => b.tenantId === t && b.id === id) ?? null); }
  async listPhoneNumbers(t: ID) { return clone(this.phoneNumbers.filter((p) => p.tenantId === t)); }
  async getPhoneNumber(t: ID, id: ID) { return clone(this.phoneNumbers.find((p) => p.tenantId === t && p.id === id) ?? null); }
  async findPhoneNumberByMetaId(m: string) { return clone(this.phoneNumbers.find((p) => p.phoneNumberId === m) ?? null); }
  async listTemplates(t: ID) { return clone(this.templates.filter((x) => x.tenantId === t)); }

  // ---- contatos -------------------------------------------------------------
  async listContactsByAudience(t: ID, tags: string[], all: boolean) {
    return clone(this.contacts.filter((c) => c.tenantId === t && (all || c.tags.some((x) => tags.includes(x)))));
  }
  async listTags(t: ID) {
    const m = new Map<string, number>();
    for (const c of this.contacts) if (c.tenantId === t) for (const tag of c.tags) m.set(tag, (m.get(tag) ?? 0) + 1);
    return [...m].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }
  async getContactByPhone(t: ID, p: string) { return clone(this.contacts.find((c) => c.tenantId === t && c.phoneE164 === p) ?? null); }
  async listContacts(t: ID, o: { search?: string; consent?: ConsentStatus; tag?: string; offset: number; limit: number }) {
    const q = (o.search ?? '').toLowerCase();
    const digits = q.replace(/\D/g, '');
    const all = this.contacts
      .filter((c) => c.tenantId === t && (!o.consent || c.consent === o.consent) && (!o.tag || c.tags.includes(o.tag)))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (digits && c.phoneE164.includes(digits)))
      .sort((a, b) => b.createdAt - a.createdAt);
    return { rows: clone(all.slice(o.offset, o.offset + o.limit)), total: all.length };
  }
  async consentCounts(t: ID) {
    const out: Record<ConsentStatus, number> = { opted_in: 0, opted_out: 0, unknown: 0 };
    for (const c of this.contacts) if (c.tenantId === t) out[c.consent]++;
    return out;
  }
  async insertContact(c: Contact) { this.contacts.push(clone(c)); }
  async updateContact(c: Contact) {
    const i = this.contacts.findIndex((x) => x.id === c.id);
    if (i >= 0) this.contacts[i] = clone(c);
  }
  async insertConsentEvent(e: ConsentEvent) { this.consentEvents.push(clone(e)); }

  // ---- blacklist ------------------------------------------------------------
  async listOptOuts(t: ID, o: { includeRevoked?: boolean; search?: string }) {
    const q = o.search?.toLowerCase().replace(/\D/g, '') ?? '';
    const qName = o.search?.toLowerCase() ?? '';
    return clone(this.optOuts
      .filter((x) => x.tenantId === t && (o.includeRevoked || x.revokedAt === null))
      .filter((x) => !o.search || (q && x.phoneE164.includes(q)) || (x.contactName ?? '').toLowerCase().includes(qName))
      .sort((a, b) => b.createdAt - a.createdAt));
  }
  async getActiveOptOut(t: ID, p: string) {
    return clone(this.optOuts.find((x) => x.tenantId === t && x.phoneE164 === p && x.revokedAt === null) ?? null);
  }
  async insertOptOut(o: OptOut) {
    const existing = await this.getActiveOptOut(o.tenantId, o.phoneE164);
    if (existing) return existing;
    this.optOuts.push(clone(o));
    const c = this.contacts.find((x) => x.tenantId === o.tenantId && x.phoneE164 === o.phoneE164);
    if (c) { c.consent = 'opted_out'; c.consentSource = o.source === 'keyword' ? 'whatsapp_keyword' : o.source === 'button' || o.source === 'flow_node' ? 'opt_out_button' : 'admin'; c.consentAt = o.createdAt; }
    return clone(o);
  }
  async revokeOptOut(t: ID, id: ID, reason: string, at: number) {
    const o = this.optOuts.find((x) => x.tenantId === t && x.id === id && x.revokedAt === null);
    if (!o) return null;
    o.revokedAt = at;
    o.revokeReason = reason;
    const c = this.contacts.find((x) => x.tenantId === t && x.phoneE164 === o.phoneE164);
    if (c) { c.consent = 'opted_in'; c.consentSource = 'support_request'; c.consentAt = at; }
    return clone(o);
  }
  async activeOptOutPhones(t: ID) {
    return new Set(this.optOuts.filter((x) => x.tenantId === t && x.revokedAt === null).map((x) => x.phoneE164));
  }

  // ---- fluxos ---------------------------------------------------------------
  async listFlows(t: ID) { return clone([...this.flows.values()].filter((f) => f.tenantId === t).sort((a, b) => b.updatedAt - a.updatedAt)); }
  async getFlow(t: ID, id: ID) { const f = this.flows.get(id); return f && f.tenantId === t ? clone(f) : null; }
  async insertFlow(f: Flow) { this.flows.set(f.id, clone(f)); }
  async updateFlow(f: Flow) { this.flows.set(f.id, clone(f)); }
  async insertFlowVersion(v: FlowVersion) { this.flowVersions.set(v.id, clone(v)); }
  async getFlowVersion(t: ID, id: ID) { const v = this.flowVersions.get(id); return v && v.tenantId === t ? clone(v) : null; }
  async latestVersionNumber(t: ID, flowId: ID) {
    let max = 0;
    for (const v of this.flowVersions.values()) if (v.tenantId === t && v.flowId === flowId) max = Math.max(max, v.version);
    return max;
  }

  // ---- campanhas ------------------------------------------------------------
  async listCampaigns(t: ID) { return clone([...this.campaigns.values()].filter((c) => c.tenantId === t).sort((a, b) => b.createdAt - a.createdAt)); }
  async listCampaignsByStatus(s: CampaignStatus[]) { return clone([...this.campaigns.values()].filter((c) => s.includes(c.status))); }
  async getCampaign(t: ID, id: ID) { const c = this.campaigns.get(id); return c && c.tenantId === t ? clone(c) : null; }
  async insertCampaign(c: Campaign) { this.campaigns.set(c.id, clone(c)); }
  async updateCampaign(c: Campaign) { this.campaigns.set(c.id, clone(c)); }

  // ---- destinatários --------------------------------------------------------
  async insertRecipients(rs: Recipient[]) {
    for (const r of rs) {
      this.recipients.set(r.id, clone(r));
      const list = this.recipientsByCampaign.get(r.campaignId) ?? [];
      list.push(r.id);
      this.recipientsByCampaign.set(r.campaignId, list);
    }
  }
  async claimPending(t: ID, campaignId: ID, limit: number) {
    const out: Recipient[] = [];
    for (const id of this.recipientsByCampaign.get(campaignId) ?? []) {
      if (out.length >= limit) break;
      const r = this.recipients.get(id)!;
      if (r.tenantId === t && r.status === 'pending') {
        r.status = 'processing';
        out.push(clone(r));
      }
    }
    return out;
  }
  async updateRecipient(r: Recipient) {
    this.recipients.set(r.id, clone(r));
    if (r.waMessageId) this.recipientByWaId.set(r.waMessageId, r.id);
  }
  async getRecipient(t: ID, id: ID) { const r = this.recipients.get(id); return r && r.tenantId === t ? clone(r) : null; }
  async findRecipientByWaMessageId(t: ID, w: string) {
    const id = this.recipientByWaId.get(w);
    const r = id ? this.recipients.get(id) : undefined;
    return r && r.tenantId === t ? clone(r) : null;
  }
  async listRecipients(t: ID, campaignId: ID, o: { statuses?: RecipientStatus[]; search?: string; offset: number; limit: number }) {
    const q = o.search?.toLowerCase();
    const all = (this.recipientsByCampaign.get(campaignId) ?? [])
      .map((id) => this.recipients.get(id)!)
      .filter((r) => r.tenantId === t)
      .filter((r) => !o.statuses?.length || o.statuses.includes(r.status))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.phoneE164.includes(q.replace(/\D/g, '') || '§'));
    all.sort((a, b) => b.updatedAt - a.updatedAt);
    return { rows: clone(all.slice(o.offset, o.offset + o.limit)), total: all.length };
  }
  async countRecipientsByStatus(t: ID, campaignId: ID) {
    const out = {
      pending: 0, skipped_optout: 0, skipped_no_consent: 0, skipped_invalid: 0, processing: 0,
      accepted: 0, sent: 0, delivered: 0, read: 0, failed: 0,
    } as Record<RecipientStatus, number>;
    for (const id of this.recipientsByCampaign.get(campaignId) ?? []) {
      const r = this.recipients.get(id)!;
      if (r.tenantId === t) out[r.status]++;
    }
    return out;
  }

  // ---- execuções ------------------------------------------------------------
  async insertRun(r: FlowRun) {
    this.runs.set(r.id, clone(r));
    const k = `${r.tenantId}|${r.phoneE164}`;
    this.runsByPhone.set(k, [...(this.runsByPhone.get(k) ?? []), r.id]);
  }
  async updateRun(r: FlowRun) { this.runs.set(r.id, clone(r)); }
  async getRun(t: ID, id: ID) { const r = this.runs.get(id); return r && r.tenantId === t ? clone(r) : null; }
  async listDueRuns(now: number, limit: number) {
    const out: FlowRun[] = [];
    for (const r of this.runs.values()) {
      if (out.length >= limit) break;
      if ((r.status === 'waiting_delay' || r.status === 'waiting_reply') && r.wakeAt !== null && r.wakeAt <= now) out.push(clone(r));
    }
    return out;
  }
  async listActiveRunsByPhone(t: ID, p: string) {
    return clone((this.runsByPhone.get(`${t}|${p}`) ?? [])
      .map((id) => this.runs.get(id)!)
      .filter((r) => ACTIVE_RUN.has(r.status))
      .sort((a, b) => b.startedAt - a.startedAt));
  }
  async campaignProgress(t: ID, campaignId: ID) {
    let inProgress = 0, finished = 0, optedOutDuringFlow = 0;
    for (const id of this.recipientsByCampaign.get(campaignId) ?? []) {
      const r = this.recipients.get(id)!;
      if (r.tenantId !== t) continue;
      if (r.status === 'skipped_optout' || r.status === 'skipped_no_consent' || r.status === 'skipped_invalid') { finished++; continue; }
      const run = r.flowRunId ? this.runs.get(r.flowRunId) : undefined;
      if (run) {
        if (ACTIVE_RUN.has(run.status)) inProgress++;
        else {
          finished++;
          if (run.status === 'opted_out') optedOutDuringFlow++;
        }
      } else if (r.status === 'failed') finished++;
    }
    return { inProgress, finished, optedOutDuringFlow };
  }
  async listRunsByIds(t: ID, ids: ID[]) {
    return clone(ids.map((id) => this.runs.get(id)).filter((r): r is FlowRun => !!r && r.tenantId === t));
  }
  async insertStep(s: Omit<RunStep, 'id'>) { this.steps.push({ ...clone(s), id: ++this.stepSeq }); }
  async aggregateSteps(t: ID, campaignId: ID) {
    const m = new Map<string, Set<ID>>();
    for (const s of this.steps) {
      if (s.tenantId !== t || s.campaignId !== campaignId) continue;
      const k = `${s.nodeId}\u0000${s.outcome}`;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(s.runId);
    }
    return [...m].map(([k, set]) => {
      const [nodeId = '', outcome = ''] = k.split('\u0000');
      return { nodeId, outcome, runs: set.size };
    });
  }
  async reachedByNode(t: ID, campaignId: ID) {
    const m = new Map<string, Set<ID>>();
    for (const s of this.steps) {
      if (s.tenantId !== t || s.campaignId !== campaignId) continue;
      if (!m.has(s.nodeId)) m.set(s.nodeId, new Set());
      m.get(s.nodeId)!.add(s.runId);
    }
    return Object.fromEntries([...m].map(([k, v]) => [k, v.size]));
  }

  async activeRunsByNode(t: ID, campaignId: ID) {
    const out: Record<string, number> = {};
    for (const r of this.runs.values()) {
      if (r.tenantId !== t || r.campaignId !== campaignId || !ACTIVE_RUN.has(r.status) || !r.currentNodeId) continue;
      out[r.currentNodeId] = (out[r.currentNodeId] ?? 0) + 1;
    }
    return out;
  }

  // ---- mensagens ------------------------------------------------------------
  async insertMessage(m: Message) {
    this.messages.set(m.id, clone(m));
    if (m.waMessageId) this.messageByWaId.set(m.waMessageId, m.id);
  }
  async updateMessage(m: Message) {
    this.messages.set(m.id, clone(m));
    if (m.waMessageId) this.messageByWaId.set(m.waMessageId, m.id);
  }
  async getMessageByWaId(t: ID, w: string) {
    const id = this.messageByWaId.get(w);
    const m = id ? this.messages.get(id) : undefined;
    return m && m.tenantId === t ? clone(m) : null;
  }
  async listMessagesByPhone(t: ID, p: string, limit: number) {
    return clone([...this.messages.values()]
      .filter((m) => m.tenantId === t && m.phoneE164 === p)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-limit));
  }
  async recordStatusEvent(_t: ID, w: string, status: string) {
    const k = `${w}|${status}`;
    if (this.statusEvents.has(k)) return false;
    this.statusEvents.add(k);
    return true;
  }
  async countBusinessInitiatedRecipients(businessAccountId: ID, since: number) {
    const phones = new Set(this.phoneNumbers.filter((p) => p.businessAccountId === businessAccountId).map((p) => p.id));
    const out = new Set<string>();
    for (const m of this.messages.values()) {
      if (m.direction === 'out' && m.type === 'template' && m.createdAt >= since && phones.has(m.phoneNumberId)) out.add(m.phoneE164);
    }
    return out;
  }

  // ---- janela ---------------------------------------------------------------
  async getWindow(t: ID, pn: ID, p: string) { return this.windows.get(`${t}|${pn}|${p}`) ?? null; }
  async touchWindow(t: ID, pn: ID, p: string, at: number) {
    const k = `${t}|${pn}|${p}`;
    this.windows.set(k, Math.max(at, this.windows.get(k) ?? 0));
  }
}
