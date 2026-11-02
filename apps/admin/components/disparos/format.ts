import type { CampaignStatus, RecipientStatus, MessageStatus, OptOutSource } from '@/lib/disparos/server/entities';
import type { RunStatus } from '@/lib/disparos/domain/flow-engine';
import { STATUS, type Intent, type StatusDef } from '@eco/tokens/status-map';
import { type FlowGraph, type FlowNode, NODE_LABEL, getNode, handleLabel, stepNumbers } from '@/lib/disparos/domain/flow-types';

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'info';

const nf = new Intl.NumberFormat('pt-BR');
export const num = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
export const pct = (part: number, total: number) => (total ? `${(Math.round((part / total) * 1000) / 10).toLocaleString('pt-BR')}%` : '—');

const dt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const tm = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const dateTime = (ms: number | null | undefined) => (ms ? dt.format(ms) : '—');
export const time = (ms: number | null | undefined) => (ms ? tm.format(ms) : '—');

/** +5551999990000 -> +55 51 99999-0000 */
export function phone(e164: string | null | undefined) {
  if (!e164) return '—';
  const m = e164.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : e164;
}

/** "há 5 min", "em 2 h" — relativo ao relógio do servidor (simulado no mock). */
export function relative(ms: number | null | undefined, now: number) {
  if (!ms) return '—';
  const d = ms - now;
  const a = Math.abs(d);
  const s = a < 60_000 ? `${Math.max(1, Math.round(a / 1000))} s`
    : a < 3_600_000 ? `${Math.round(a / 60_000)} min`
      : a < 86_400_000 ? `${Math.round(a / 3_600_000)} h`
        : `${Math.round(a / 86_400_000)} d`;
  return d >= 0 ? `em ${s}` : `há ${s}`;
}

// Rótulos e intenção vêm do status-map do Design System (@eco/tokens), dono: chat UX & DS.
const INTENT_TONE: Record<Intent, Tone> = { success: 'ok', info: 'info', warning: 'warn', serious: 'warn', danger: 'bad', neutral: 'neutral' };
function fromDs<K extends string>(m: Record<K, StatusDef>): Record<K, { label: string; tone: Tone }> {
  return Object.fromEntries(Object.entries<StatusDef>(m).map(([k, v]) => [k, { label: v.label, tone: INTENT_TONE[v.intent] }])) as Record<K, { label: string; tone: Tone }>;
}
const labels = <K extends string>(m: Record<K, StatusDef>) =>
  Object.fromEntries(Object.entries<StatusDef>(m).map(([k, v]) => [k, v.label])) as Record<K, string>;

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = fromDs(STATUS.campaign);

export const RECIPIENT_STATUS: Record<RecipientStatus, { label: string; tone: Tone }> = {
  ...fromDs(STATUS.recipient),
  // ainda não está no status-map do DS (pedido aberto ao chat UX & DS)
  skipped_no_consent: { label: 'Pulado: sem opt-in', tone: 'neutral' },
};

export const RUN_STATUS: Record<RunStatus, { label: string; tone: Tone }> = fromDs(STATUS.flowRun);

export const MESSAGE_STATUS: Record<MessageStatus, string> = {
  queued: 'na fila', accepted: 'aceita', sent: 'enviada', delivered: 'entregue', read: 'lida',
  played: 'ouvida', failed: 'falhou', received: 'recebida',
};

export const OPTOUT_SOURCE: Record<OptOutSource, string> = labels(STATUS.optOutSource);

/** "Etapa 3 · Botões" */
export function stepLabel(graph: FlowGraph, nodeId: string | null | undefined, steps = stepNumbers(graph)) {
  const node = getNode(graph, nodeId);
  if (!node) return '—';
  if (node.type === 'start') return 'Início';
  return `Etapa ${steps.get(node.id)} · ${NODE_LABEL[node.type]}`;
}

/** Nome legível de um resultado de etapa do funil. */
export function outcomeLabel(node: FlowNode | undefined, outcome: string): { label: string; tone: Tone } {
  if (outcome.startsWith('reply:')) {
    const label = node ? handleLabel(node, `btn:${outcome.slice(6)}`) : outcome.slice(6);
    const optOut = node && (node.type === 'buttons' || node.type === 'template')
      && node.data.buttons.find((b) => b.key === outcome.slice(6))?.optOut;
    return { label: `“${label}”`, tone: optOut ? 'bad' : 'ok' };
  }
  const map: Record<string, { label: string; tone: Tone }> = {
    sent: { label: 'enviada', tone: 'info' },
    waiting: { label: 'esperando', tone: 'neutral' },
    timeout: { label: 'sem resposta', tone: 'warn' },
    opted_out: { label: 'saiu (blacklist)', tone: 'bad' },
    window_closed: { label: 'janela 24h fechada', tone: 'warn' },
    unrecognized: { label: 'resposta fora dos botões', tone: 'neutral' },
    completed: { label: 'concluiu', tone: 'ok' },
    resumed: { label: 'retomou', tone: 'neutral' },
    started: { label: 'iniciou', tone: 'neutral' },
    error: { label: 'erro', tone: 'bad' },
  };
  return map[outcome] ?? { label: outcome, tone: 'neutral' };
}

export const CONSENT: Record<'opted_in' | 'opted_out' | 'unknown', { label: string; tone: Tone }> = fromDs(STATUS.consent);

export const CONSENT_SOURCE: Record<string, string> = labels(STATUS.consentSource);

export const cx = (...c: unknown[]) => c.filter((x): x is string => typeof x === 'string' && x.length > 0).join(' ');
