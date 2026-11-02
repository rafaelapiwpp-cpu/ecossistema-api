import type { CampaignStatus, RecipientStatus, MessageStatus, OptOutSource } from '@/lib/disparos/server/entities';
import type { RunStatus } from '@/lib/disparos/domain/flow-engine';
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

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  scheduled: { label: 'Agendada', tone: 'info' },
  running: { label: 'Em andamento', tone: 'accent' },
  paused: { label: 'Pausada', tone: 'warn' },
  completed: { label: 'Concluída', tone: 'ok' },
  canceled: { label: 'Cancelada', tone: 'neutral' },
  failed: { label: 'Falhou', tone: 'bad' },
};

export const RECIPIENT_STATUS: Record<RecipientStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Na fila', tone: 'neutral' },
  processing: { label: 'Enviando', tone: 'accent' },
  accepted: { label: 'Aceita pela API', tone: 'info' },
  sent: { label: 'Enviada', tone: 'info' },
  delivered: { label: 'Entregue', tone: 'ok' },
  read: { label: 'Lida', tone: 'ok' },
  failed: { label: 'Falhou', tone: 'bad' },
  skipped_optout: { label: 'Blacklist', tone: 'bad' },
  skipped_invalid: { label: 'Número inválido', tone: 'warn' },
  skipped_no_consent: { label: 'Sem opt-in', tone: 'warn' },
};

export const RUN_STATUS: Record<RunStatus, { label: string; tone: Tone }> = {
  active: { label: 'Executando', tone: 'accent' },
  waiting_delay: { label: 'Aguardando tempo', tone: 'warn' },
  waiting_reply: { label: 'Aguardando resposta', tone: 'info' },
  completed: { label: 'Concluído', tone: 'ok' },
  opted_out: { label: 'Saiu (opt-out)', tone: 'bad' },
  failed: { label: 'Erro', tone: 'bad' },
  canceled: { label: 'Cancelado', tone: 'neutral' },
};

export const MESSAGE_STATUS: Record<MessageStatus, string> = {
  queued: 'na fila', accepted: 'aceita', sent: 'enviada', delivered: 'entregue', read: 'lida',
  played: 'ouvida', failed: 'falhou', received: 'recebida',
};

export const OPTOUT_SOURCE: Record<OptOutSource, string> = {
  keyword: 'Palavra-chave (ex.: SAIR)',
  button: 'Botão de saída',
  flow_node: 'Etapa Blacklist do fluxo',
  meta_marketing_optout: 'Parou marketing no WhatsApp',
  manual: 'Manual',
  import: 'Importação',
};

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

export const CONSENT: Record<'opted_in' | 'opted_out' | 'unknown', { label: string; tone: Tone }> = {
  opted_in: { label: 'Opt-in registrado', tone: 'ok' },
  opted_out: { label: 'Opt-out (blacklist)', tone: 'bad' },
  unknown: { label: 'Sem consentimento', tone: 'neutral' },
};

export const CONSENT_SOURCE: Record<string, string> = {
  web_form: 'Formulário do site', checkout: 'Checkout / compra', whatsapp_inbound: 'Mandou mensagem no WhatsApp',
  whatsapp_keyword: 'Palavra-chave no WhatsApp', opt_out_button: 'Botão de saída', import: 'Lista importada com opt-in',
  api: 'API', support_request: 'Pedido ao atendimento', admin: 'Operador',
};

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
