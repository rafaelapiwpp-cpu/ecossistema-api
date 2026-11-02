import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addNode, connect, removeNode, updateData, duplicateNode, firstFreeHandle, slugKey } from '../domain/graph-ops';
import { blankGraph, confirmationGraph } from '../domain/flow-presets';
import { getNode, stepNumbers } from '../domain/flow-types';
import { validateFlow } from '../domain/flow-validate';
import { createMockContainer } from '../server/mock-container';
import { DEMO_PHONE_MAIN, DEMO_TENANT as T } from '../server/seed';

test('editor: ligar uma saída substitui a ligação anterior (uma saída, um destino)', () => {
  let g = blankGraph();
  const a = addNode(g, 'template', { x: 300, y: 200 }); g = a.graph;
  const b = addNode(g, 'text', { x: 600, y: 200 }); g = b.graph;
  g = connect(g, 'start', 'next', a.id);
  g = connect(g, 'start', 'next', b.id);
  const outs = g.edges.filter((e) => e.source === 'start');
  assert.equal(outs.length, 1);
  assert.equal(outs[0]?.target, b.id);
});

test('editor: não liga em si mesmo nem no Início', () => {
  let g = blankGraph();
  const a = addNode(g, 'text', { x: 0, y: 0 }); g = a.graph;
  assert.equal(connect(g, a.id, 'next', a.id).edges.length, 0);
  assert.equal(connect(g, a.id, 'next', 'start').edges.length, 0);
});

test('editor: apagar botão remove a conexão daquela saída; apagar etapa remove as dela', () => {
  let g = confirmationGraph();
  const before = g.edges.filter((e) => e.source === 'when').length;
  const when = getNode(g, 'when')!;
  if (when.type !== 'buttons') throw new Error('preset mudou');
  g = updateData(g, 'when', { buttons: when.data.buttons.filter((b) => b.key !== 'nao') });
  assert.equal(g.edges.filter((e) => e.source === 'when').length, before - 1);
  assert.ok(!g.edges.some((e) => e.sourceHandle === 'btn:nao'));
  assert.ok(validateFlow(g).issues.every((i) => i.code !== 'bad_handle'));

  g = removeNode(g, 'wait');
  assert.ok(!g.edges.some((e) => e.source === 'wait' || e.target === 'wait'));
  assert.equal(removeNode(g, 'start'), g, 'Início não pode ser apagado');
});

test('editor: duplicar cria cópia solta e numeração ETAPA segue o caminho', () => {
  const g0 = confirmationGraph();
  const d = duplicateNode(g0, 'ok')!;
  assert.equal(d.graph.nodes.length, g0.nodes.length + 1);
  assert.ok(!d.graph.edges.some((e) => e.target === d.id || e.source === d.id));
  const steps = stepNumbers(d.graph);
  assert.equal(steps.get('tpl'), 1);
  assert.equal(steps.get(d.id), g0.nodes.length, 'nó solto fica por último');
  assert.equal(firstFreeHandle(d.graph, getNode(d.graph, 'tpl')!), 'btn:parar');
});

test('editor: chave de botão estável e única', () => {
  assert.equal(slugKey('Não quero mais', []), 'nao_quero_mais');
  assert.equal(slugKey('Sim', ['sim']), 'sim_2');
});

test('campanha: contatos por etapa agora somam o total em andamento', async () => {
  const c = await createMockContainer({ withHistory: false, speed: 0 });
  const s = c.service;
  const camp = await s.createCampaign(T, { name: 'Ao vivo', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_confirmacao', audience: { tags: ['consultas-semana'] }, ratePerMinute: 120, startNow: true });
  for (let i = 0; i < 6; i++) { c.mock!.clock.advanceBy(30_000); await c.tick(); }
  const det = await s.getCampaign(T, camp.id);
  const live = Object.values(det.liveByNode).reduce((a, b) => a + b, 0);
  assert.ok(det.stats.inProgress > 0);
  assert.equal(live, det.stats.inProgress);
  assert.ok((det.liveByNode.tpl ?? 0) > 0, 'maioria aguardando resposta no modelo');
});
