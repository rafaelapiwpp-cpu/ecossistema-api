/**
 * Motor de execução do fluxo — função pura.
 *
 *   advance(grafo, estado, evento, ambiente) -> { estado novo, ações }
 *
 * Não faz I/O: quem chama (service/worker) executa as ações (enviar, pôr na
 * blacklist, gravar log) e persiste o estado. Isso deixa o motor igual no mock,
 * na Meta e nos testes.
 *
 * Opt-out por design:
 *  1. env.optedOut é checado ANTES de qualquer coisa: contato na blacklist não
 *     recebe mais nada, mesmo no meio do fluxo.
 *  2. Botão marcado optOut encerra o fluxo e gera ação 'optout', com ou sem
 *     conexão no desenho.
 *  3. Etapa Blacklist gera ação 'optout' e encerra.
 *  (Palavras como SAIR são tratadas no service, antes de chegar aqui, porque
 *   valem mesmo para quem não está em fluxo nenhum.)
 */
import {
  FlowGraph, FlowNode, NodeType, FlowButton, getNode, nextTarget, renderVars,
} from './flow-types';
import { normalizeText } from './optout';
import type { OutboundMessage } from '../whatsapp/types';

export type RunStatus =
  | 'active' | 'waiting_delay' | 'waiting_reply'
  | 'completed' | 'opted_out' | 'failed' | 'canceled';

export const TERMINAL_RUN: ReadonlySet<RunStatus> = new Set(['completed', 'opted_out', 'failed', 'canceled']);

export interface RunState {
  id: string;
  status: RunStatus;
  currentNodeId: string | null;
  wakeAt: number | null;              // epoch ms — fim do Aguardar ou timeout de resposta
  vars: Record<string, string>;       // nome, telefone, variáveis da campanha...
  answers: Record<string, string>;    // nodeId -> key do botão escolhido
  stepCount: number;
  lastError: string | null;
}

export type EngineEvent =
  | { kind: 'start' }
  | { kind: 'wake' }
  | { kind: 'reply'; payload?: string; text?: string };

export interface EngineEnv {
  now: number;
  optedOut: boolean;
  /** Até quando a janela de 24h está aberta (última msg recebida + 24h). */
  windowOpenUntil: number | null;
}

export type EngineAction =
  | { type: 'send'; nodeId: string; nodeType: NodeType; message: OutboundMessage; preview: string }
  | { type: 'optout'; nodeId: string; source: 'button' | 'flow_node'; reason: string; triggerText?: string }
  | { type: 'step'; nodeId: string; nodeType: NodeType; outcome: string; detail?: Record<string, unknown> };

export interface AdvanceResult { state: RunState; actions: EngineAction[] }

const MAX_STEPS_PER_ADVANCE = 50;

export function newRunState(id: string, vars: Record<string, string>): RunState {
  return { id, status: 'active', currentNodeId: null, wakeAt: null, vars, answers: {}, stepCount: 0, lastError: null };
}

// ---- payload dos botões ------------------------------------------------------
// Vai no id do reply button / payload do quick reply. Amarra a resposta à execução
// e à etapa: clique em botão de mensagem antiga não move um fluxo novo.

export function encodeButtonPayload(runId: string, nodeId: string, key: string): string {
  return `dx1|${runId}|${nodeId}|${key}`;
}

export function decodeButtonPayload(p: string | undefined): { runId: string; nodeId: string; key: string } | null {
  if (!p) return null;
  const parts = p.split('|');
  const [tag, runId, nodeId, key] = parts;
  if (parts.length !== 4 || tag !== 'dx1' || !runId || !nodeId || !key) return null;
  return { runId, nodeId, key };
}

// ---- motor -------------------------------------------------------------------

export function advance(graph: FlowGraph, prev: RunState, event: EngineEvent, env: EngineEnv): AdvanceResult {
  const s: RunState = structuredClone(prev);
  const actions: EngineAction[] = [];
  const step = (node: FlowNode, outcome: string, detail?: Record<string, unknown>) =>
    actions.push({ type: 'step', nodeId: node.id, nodeType: node.type, outcome, detail });
  const finish = (status: RunStatus, error: string | null = null): AdvanceResult => {
    s.status = status;
    s.wakeAt = null;
    s.lastError = error;
    return { state: s, actions };
  };
  const noop = (): AdvanceResult => ({ state: prev, actions: [] });

  if (TERMINAL_RUN.has(s.status)) return noop();

  if (env.optedOut) {
    const cur = getNode(graph, s.currentNodeId);
    if (cur) step(cur, 'opted_out');
    return finish('opted_out');
  }

  const windowOpen = () => env.windowOpenUntil !== null && env.now < env.windowOpenUntil;
  let nextId: string | null;

  switch (event.kind) {
    case 'start': {
      const start = graph.nodes.find((n) => n.type === 'start');
      if (!start) return finish('failed', 'no_start');
      s.currentNodeId = start.id;
      step(start, 'started');
      nextId = nextTarget(graph, start.id, 'next');
      break;
    }
    case 'wake': {
      if (s.wakeAt === null || env.now < s.wakeAt) return noop();
      const cur = getNode(graph, s.currentNodeId);
      if (!cur) return finish('failed', 'missing_node');
      if (s.status === 'waiting_delay') {
        step(cur, 'resumed');
        nextId = nextTarget(graph, cur.id, 'next');
      } else if (s.status === 'waiting_reply') {
        step(cur, 'timeout');
        nextId = nextTarget(graph, cur.id, 'timeout');
      } else {
        return noop();
      }
      break;
    }
    case 'reply': {
      if (s.status !== 'waiting_reply') return noop();
      const cur = getNode(graph, s.currentNodeId);
      if (!cur || (cur.type !== 'buttons' && cur.type !== 'template')) return noop();
      const match = matchButton(cur.data.buttons, cur.id, s.id, event);
      if (!match) {
        step(cur, 'unrecognized', { text: event.text ?? null });
        return { state: s, actions };            // continua esperando
      }
      s.answers[cur.id] = match.key;
      step(cur, `reply:${match.key}`, { label: match.label });
      if (match.optOut) {
        actions.push({ type: 'optout', nodeId: cur.id, source: 'button', reason: `Clicou em "${match.label}"`, triggerText: match.label });
        return finish('opted_out');
      }
      nextId = nextTarget(graph, cur.id, `btn:${match.key}`);
      break;
    }
  }

  s.status = 'active';
  s.wakeAt = null;

  for (let guard = 0; ; guard++) {
    if (!nextId) return finish('completed');
    if (guard >= MAX_STEPS_PER_ADVANCE) return finish('failed', 'loop_guard');
    const node = getNode(graph, nextId);
    if (!node) return finish('failed', 'missing_node');
    s.currentNodeId = node.id;
    s.stepCount++;

    switch (node.type) {
      case 'start':
        nextId = nextTarget(graph, node.id, 'next');
        continue;

      case 'text': {
        if (!windowOpen()) { step(node, 'window_closed'); return finish('failed', 'window_closed'); }
        const body = renderVars(node.data.text, s.vars);
        actions.push({ type: 'send', nodeId: node.id, nodeType: node.type, message: { type: 'text', body }, preview: body });
        step(node, 'sent');
        nextId = nextTarget(graph, node.id, 'next');
        continue;
      }

      case 'audio': {
        if (!windowOpen()) { step(node, 'window_closed'); return finish('failed', 'window_closed'); }
        actions.push({
          type: 'send', nodeId: node.id, nodeType: node.type,
          message: { type: 'audio', mediaId: node.data.mediaId, link: node.data.mediaId ? undefined : node.data.mediaUrl, voice: node.data.voice },
          preview: node.data.voice ? '🎤 Nota de voz' : `🎵 ${node.data.fileName || 'Áudio'}`,
        });
        step(node, 'sent');
        nextId = nextTarget(graph, node.id, 'next');
        continue;
      }

      case 'template': {
        // Modelo aprovado pode sair com a janela fechada — é o único jeito de iniciar conversa.
        const params = node.data.variables.map((v) => renderVars(v, s.vars));
        const preview = node.data.bodyPreview.replace(/\{\{(\d+)\}\}/g, (_, i) => params[Number(i) - 1] ?? '');
        actions.push({
          type: 'send', nodeId: node.id, nodeType: node.type,
          message: {
            type: 'template', name: node.data.templateName, language: node.data.language,
            bodyParams: params,
            quickReplyPayloads: node.data.buttons.map((b) => encodeButtonPayload(s.id, node.id, b.key)),
            meta: { category: node.data.category, buttons: node.data.buttons.map((b) => ({ text: b.label, optOut: b.optOut })) },
          },
          preview,
        });
        step(node, 'sent');
        if (node.data.buttons.length) {
          s.status = 'waiting_reply';
          s.wakeAt = node.data.timeoutSeconds ? env.now + node.data.timeoutSeconds * 1000 : null;
          step(node, 'waiting');
          return { state: s, actions };
        }
        nextId = nextTarget(graph, node.id, 'next');
        continue;
      }

      case 'buttons': {
        if (!windowOpen()) { step(node, 'window_closed'); return finish('failed', 'window_closed'); }
        const body = renderVars(node.data.text, s.vars);
        actions.push({
          type: 'send', nodeId: node.id, nodeType: node.type,
          message: {
            type: 'interactive_buttons', body,
            buttons: node.data.buttons.map((b) => ({ id: encodeButtonPayload(s.id, node.id, b.key), title: b.label })),
          },
          preview: `${body}\n${node.data.buttons.map((b) => `[ ${b.label} ]`).join(' ')}`,
        });
        step(node, 'sent');
        s.status = 'waiting_reply';
        s.wakeAt = node.data.timeoutSeconds ? env.now + node.data.timeoutSeconds * 1000 : null;
        step(node, 'waiting');
        return { state: s, actions };
      }

      case 'delay':
        s.status = 'waiting_delay';
        s.wakeAt = env.now + node.data.seconds * 1000;
        step(node, 'waiting', { seconds: node.data.seconds });
        return { state: s, actions };

      case 'optout': {
        if (node.data.confirmationText && windowOpen()) {
          const body = renderVars(node.data.confirmationText, s.vars);
          actions.push({ type: 'send', nodeId: node.id, nodeType: node.type, message: { type: 'text', body }, preview: body });
        }
        actions.push({ type: 'optout', nodeId: node.id, source: 'flow_node', reason: node.data.reason || 'Etapa Blacklist do fluxo' });
        step(node, 'opted_out');
        return finish('opted_out');
      }

      case 'end':
        step(node, 'completed');
        return finish('completed');
    }
  }
}

function matchButton(
  buttons: FlowButton[], nodeId: string, runId: string,
  ev: { payload?: string; text?: string },
): FlowButton | null {
  const decoded = decodeButtonPayload(ev.payload);
  if (decoded) {
    if (decoded.runId !== runId || decoded.nodeId !== nodeId) return null; // botão de mensagem antiga
    return buttons.find((b) => b.key === decoded.key) ?? null;
  }
  const text = ev.text ?? (ev.payload && !ev.payload.startsWith('dx1|') ? ev.payload : undefined);
  if (!text) return null;
  const t = normalizeText(text);
  const byLabel = buttons.find((b) => normalizeText(b.label) === t);
  if (byLabel) return byLabel;
  const idx = Number(t);
  if (Number.isInteger(idx) && idx >= 1 && idx <= buttons.length) return buttons[idx - 1] ?? null;
  return null;
}
