import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, encodeButtonPayload, newRunState, EngineEnv, RunState } from '../domain/flow-engine';
import { confirmationGraph } from '../domain/flow-presets';
import type { FlowGraph } from '../domain/flow-types';

const H = 3600_000;
const closed = (now = 0): EngineEnv => ({ now, optedOut: false, windowOpenUntil: null });
const open = (now = 0): EngineEnv => ({ now, optedOut: false, windowOpenUntil: now + 24 * H });
const sends = (a: { type: string }[]) => a.filter((x) => x.type === 'send');

function started(g = confirmationGraph()) {
  const r = advance(g, newRunState('run1', { nome: 'Ana', data_consulta: 'ter, 4/11 às 14h' }), { kind: 'start' }, closed(0));
  return { g, ...r };
}

test('início envia o modelo (janela fechada é permitida) e espera resposta com timeout', () => {
  const { state, actions } = started();
  const s = sends(actions);
  assert.equal(s.length, 1);
  assert.equal((s[0] as any).message.type, 'template');
  assert.deepEqual((s[0] as any).message.bodyParams, ['Ana', 'ter, 4/11 às 14h']);
  assert.equal((s[0] as any).preview, 'Olá Ana, sua consulta está marcada para ter, 4/11 às 14h. Podemos confirmar?');
  assert.equal((s[0] as any).message.quickReplyPayloads[0], encodeButtonPayload('run1', 'tpl', 'confirmar'));
  assert.equal(state.status, 'waiting_reply');
  assert.equal(state.wakeAt, 24 * H);
});

test('resposta por payload segue o ramo do botão e para no Aguardar', () => {
  const { g, state } = started();
  const r = advance(g, state, { kind: 'reply', payload: encodeButtonPayload('run1', 'tpl', 'confirmar') }, open(1000));
  assert.equal(r.state.answers.tpl, 'confirmar');
  assert.equal(sends(r.actions).length, 1);
  assert.match((sends(r.actions)[0] as any).preview, /Perfeito, Ana/);
  assert.equal(r.state.status, 'waiting_delay');
  assert.equal(r.state.wakeAt, 1000 + 30 * 60_000);

  assert.equal(advance(g, r.state, { kind: 'wake' }, open(5000)).state, r.state, 'acordar antes da hora não faz nada');
  const w = advance(g, r.state, { kind: 'wake' }, open(1000 + 30 * 60_000));
  assert.equal((sends(w.actions)[0] as any).message.type, 'audio');
  assert.equal((sends(w.actions)[0] as any).message.voice, true);
  assert.equal(w.state.status, 'completed');
});

test('texto com o nome do botão ou o número também vale', () => {
  const { g, state } = started();
  assert.equal(advance(g, state, { kind: 'reply', text: 'confirmar!' }, open()).state.answers.tpl, 'confirmar');
  assert.equal(advance(g, state, { kind: 'reply', text: '2' }, open()).state.answers.tpl, 'remarcar');
});

test('clique em botão de mensagem antiga (outra execução) não move o fluxo', () => {
  const { g, state } = started();
  const r = advance(g, state, { kind: 'reply', payload: encodeButtonPayload('run_antiga', 'tpl', 'confirmar') }, open());
  assert.equal(r.state.status, 'waiting_reply');
  assert.ok(r.actions.some((a) => a.type === 'step' && a.outcome === 'unrecognized'));
});

test('botão marcado como opt-out gera blacklist e encerra, mesmo sem conexão', () => {
  const { g, state } = started();
  const r = advance(g, state, { kind: 'reply', payload: encodeButtonPayload('run1', 'tpl', 'parar') }, open());
  assert.equal(r.state.status, 'opted_out');
  assert.ok(r.actions.some((a) => a.type === 'optout' && a.source === 'button'));
  assert.equal(sends(r.actions).length, 0);
});

test('contato na blacklist não recebe nada, em qualquer ponto', () => {
  const { g, state } = started();
  const r = advance(g, state, { kind: 'reply', text: 'confirmar' }, { ...open(), optedOut: true });
  assert.equal(r.state.status, 'opted_out');
  assert.equal(sends(r.actions).length, 0);
  const fresh = advance(g, newRunState('x', {}), { kind: 'start' }, { ...closed(), optedOut: true });
  assert.equal(fresh.state.status, 'opted_out');
  assert.equal(sends(fresh.actions).length, 0);
});

test('etapa Blacklist confirma (janela aberta) e põe na blacklist', () => {
  const { g, state } = started();
  const a = advance(g, state, { kind: 'reply', text: 'remarcar' }, open(0));
  assert.equal(a.state.currentNodeId, 'when');
  const b = advance(g, a.state, { kind: 'reply', text: 'Não quero mais' }, open(10));
  assert.equal(b.state.status, 'opted_out');
  assert.match((sends(b.actions)[0] as any).preview, /não vai mais receber/);
  assert.ok(b.actions.some((x) => x.type === 'optout' && x.source === 'flow_node'));
});

test('timeout sem saída conectada encerra como concluído', () => {
  const { g, state } = started();
  const r = advance(g, state, { kind: 'wake' }, closed(24 * H));
  assert.equal(r.state.status, 'completed');
  assert.ok(r.actions.some((a) => a.type === 'step' && a.outcome === 'timeout'));
});

test('texto com janela fechada falha em vez de enviar (proteção do número)', () => {
  const g: FlowGraph = {
    nodes: [
      { id: 's', type: 'start', position: { x: 0, y: 0 }, data: { trigger: 'campaign' } },
      { id: 't', type: 'text', position: { x: 0, y: 0 }, data: { text: 'oi' } },
    ],
    edges: [{ id: 'e', source: 's', sourceHandle: 'next', target: 't' }],
  };
  const r = advance(g, newRunState('r', {}), { kind: 'start' }, closed());
  assert.equal(r.state.status, 'failed');
  assert.equal(r.state.lastError, 'window_closed');
  assert.equal(sends(r.actions).length, 0);
});

test('estado terminal é imutável', () => {
  const s: RunState = { ...newRunState('r', {}), status: 'opted_out' };
  const r = advance(confirmationGraph(), s, { kind: 'start' }, open());
  assert.equal(r.state, s);
  assert.equal(r.actions.length, 0);
});
