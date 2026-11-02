/**
 * Cliente HTTP das telas. Os tipos vêm direto do DisparosService, então a tela
 * e a API nunca divergem — trocar mock por Postgres/Meta não muda nada aqui.
 */
import type { DisparosService } from '@/lib/disparos/server/service';
import type { Audience, Campaign, Flow, OptOut } from '@/lib/disparos/server/entities';
import type { FlowGraph } from '@/lib/disparos/domain/flow-types';
import type { ValidationResult } from '@/lib/disparos/domain/flow-validate';

type Ret<K extends keyof DisparosService> = DisparosService[K] extends (...a: never[]) => Promise<infer R> ? R : never;

export type Bootstrap = {
  providerKind: 'mock' | 'meta';
  now: number;
  sim: { speed: number | null; pendingEvents: number } | null;
  phoneNumbers: Ret<'listPhoneNumbers'>;
  templates: Ret<'listTemplates'>;
  tags: Ret<'listTags'>;
};
export type PhoneNumberItem = Bootstrap['phoneNumbers'][number];
export type CampaignListItem = Ret<'listCampaigns'>[number];
export type CampaignDetail = Ret<'getCampaign'>;
export type FlowListItem = Ret<'listFlows'>[number];
export type FlowDetail = Ret<'getFlow'>;
export type RecipientsPage = Ret<'listRecipients'>;
export type RecipientRow = RecipientsPage['rows'][number];
export type Conversation = Ret<'conversation'>;
export type AudiencePreview = Ret<'audiencePreview'>;
export type ContactsPage = Ret<'listContacts'>;
export type ImportResult = Ret<'importContacts'>;
export type { Campaign, Flow, OptOut, FlowGraph, ValidationResult };

export class ApiError extends Error {
  constructor(public status: number, message: string, public details: unknown) { super(message); }
}

const BASE = '/api/disparos';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Erro ${res.status}`, (data as { details?: unknown }).details);
  return data as T;
}

export const api = {
  bootstrap: () => req<Bootstrap>('GET', '/bootstrap'),

  flows: () => req<FlowListItem[]>('GET', '/flows'),
  flow: (id: string) => req<FlowDetail>('GET', `/flows/${id}`),
  createFlow: (name: string, preset: 'blank' | 'confirmation') => req<Flow>('POST', '/flows', { name, preset }),
  saveFlow: (id: string, input: { name?: string; graph?: FlowGraph }) => req<FlowDetail>('PUT', `/flows/${id}`, input),
  publishFlow: (id: string) => req<FlowDetail>('POST', `/flows/${id}/publish`),

  campaigns: () => req<CampaignListItem[]>('GET', '/campaigns'),
  campaign: (id: string) => req<CampaignDetail>('GET', `/campaigns/${id}`),
  audiencePreview: (phoneNumberId: string, audience: Audience) =>
    req<AudiencePreview>('POST', '/campaigns/preview', { phoneNumberId, audience }),
  createCampaign: (input: {
    name: string; phoneNumberId: string; flowId: string; audience: Audience;
    ratePerMinute: number; scheduledAt?: number | null; startNow?: boolean;
  }) => req<Campaign>('POST', '/campaigns', input),
  campaignAction: (id: string, action: 'start' | 'pause' | 'resume' | 'cancel') =>
    req<Campaign>('POST', `/campaigns/${id}/${action}`),
  recipients: (id: string, q: { filter: string; search: string; page: number }) =>
    req<RecipientsPage>('GET', `/campaigns/${id}/recipients?filter=${q.filter}&search=${encodeURIComponent(q.search)}&page=${q.page}`),

  conversation: (phone: string) => req<Conversation>('GET', `/conversations/${encodeURIComponent(phone)}`),

  contacts: (q: { search: string; consent: string; tag: string; page: number }) =>
    req<ContactsPage>('GET', `/contacts?search=${encodeURIComponent(q.search)}&consent=${q.consent}&tag=${encodeURIComponent(q.tag)}&page=${q.page}`),
  importContacts: (input: { text: string; tags: string[]; consentSource: string; consentNote: string }) =>
    req<ImportResult>('POST', '/contacts/import', input),
  sampleContacts: () => req<ImportResult>('POST', '/contacts/sample'),

  blacklist: (search: string, revoked: boolean) =>
    req<OptOut[]>('GET', `/blacklist?search=${encodeURIComponent(search)}${revoked ? '&revoked=1' : ''}`),
  addOptOut: (phone: string, reason: string) => req<OptOut>('POST', '/blacklist', { phone, reason }),
  revokeOptOut: (id: string, reason: string) => req<OptOut>('POST', `/blacklist/${id}/revoke`, { reason }),

  simSpeed: (speed: number) => req<{ speed: number }>('POST', '/sim', { speed }),
  simInbound: (phone: string, text: string, phoneNumberId?: string) =>
    req<{ ok: true }>('POST', '/sim/inbound', { phone, text, phoneNumberId }),
};
