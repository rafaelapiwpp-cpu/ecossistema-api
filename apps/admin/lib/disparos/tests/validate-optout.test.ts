import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFlow } from '../domain/flow-validate';
import { confirmationGraph, promoGraph, reactivationDraftGraph } from '../domain/flow-presets';
import { isOptOutText } from '../domain/optout';
import { stepNumbers, FlowGraph } from '../domain/flow-types';

const codes = (g: FlowGraph) => validateFlow(g).issues.map((i) => i.code);

test('fluxos de exemplo publicáveis', () => {
  assert.equal(validateFlow(confirmationGraph()).canPublish, true, JSON.stringify(validateFlow(confirmationGraph()).issues));
  assert.equal(validateFlow(promoGraph()).canPublish, true);
});

test('texto antes de qualquer resposta = fora da janela de 24h', () => {
  const v = validateFlow(reactivationDraftGraph());
  assert.equal(v.canPublish, false);
  assert.ok(v.issues.some((i) => i.code === 'outside_window' && i.nodeId === 'txt'));
});

test('mais de 24h de espera depois da resposta vira aviso', () => {
  const g = confirmationGraph();
  (g.nodes.find((n) => n.id === 'wait')!.data as any).seconds = 25 * 3600;
  assert.ok(codes(g).includes('window_expired'));
});

test('limites de botões do WhatsApp', () => {
  const g = confirmationGraph();
  const when = g.nodes.find((n) => n.id === 'when')! as any;
  when.data.buttons.push({ key: 'x', label: 'Quarto' });
  when.data.buttons[0].label = 'Um texto grande demais pro botão';
  const c = codes(g);
  assert.ok(c.includes('buttons_count'));
  assert.ok(c.includes('button_long'));
});

test('laço sem espera é erro; com Aguardar não', () => {
  const g: FlowGraph = {
    nodes: [
      { id: 's', type: 'start', position: { x: 0, y: 0 }, data: { trigger: 'campaign' } },
      { id: 'a', type: 'template', position: { x: 0, y: 0 }, data: { templateName: 'x', language: 'pt_BR', category: 'UTILITY', bodyPreview: '', variables: [], buttons: [], timeoutSeconds: null } },
      { id: 'b', type: 'template', position: { x: 0, y: 0 }, data: { templateName: 'y', language: 'pt_BR', category: 'UTILITY', bodyPreview: '', variables: [], buttons: [], timeoutSeconds: null } },
    ],
    edges: [
      { id: '1', source: 's', sourceHandle: 'next', target: 'a' },
      { id: '2', source: 'a', sourceHandle: 'next', target: 'b' },
      { id: '3', source: 'b', sourceHandle: 'next', target: 'a' },
    ],
  };
  assert.ok(codes(g).includes('instant_loop'));
  g.nodes.push({ id: 'd', type: 'delay', position: { x: 0, y: 0 }, data: { seconds: 60 } });
  g.edges[2] = { id: '3', source: 'b', sourceHandle: 'next', target: 'd' };
  g.edges.push({ id: '4', source: 'd', sourceHandle: 'next', target: 'a' });
  assert.ok(!codes(g).includes('instant_loop'));
});

test('modelo de marketing sem botão de saída gera aviso', () => {
  const g = promoGraph();
  (g.nodes.find((n) => n.id === 'tpl')!.data as any).buttons = [{ key: 'q', label: 'Quero saber' }];
  assert.ok(codes(g).includes('marketing_no_optout'));
});

test('numeração das etapas segue cada ramo', () => {
  const n = stepNumbers(confirmationGraph());
  assert.deepEqual(['tpl', 'ok', 'wait', 'aud', 'when', 'noted', 'bye'].map((id) => n.get(id)), [1, 2, 3, 4, 5, 6, 7]);
});

test('detecção de pedido de saída', () => {
  for (const t of ['SAIR', 'Sair!', 'parar', 'STOP', 'não quero mais receber', 'por favor me tira da lista', 'Pare de mandar mensagem', 'sair 🙏'])
    assert.equal(isOptOutText(t), true, t);
  for (const t of ['Cancelar', 'cancelar consulta', 'vou sair mais cedo do trabalho', 'quero saber', 'ok', '', 'Não quero'])
    assert.equal(isOptOutText(t), false, t);
  assert.equal(isOptOutText('chega', ['chega']), true);
});

test('modelo de marketing sem botão de saída não publica', async () => {
  const { validateFlow } = await import('../domain/flow-validate');
  const { promoGraph } = await import('../domain/flow-presets');
  const g = promoGraph();
  assert.ok(validateFlow(g).canPublish, 'preset tem "Parar promoções" marcado como saída');
  const tpl = g.nodes.find((n) => n.id === 'tpl')!;
  if (tpl.type !== 'template') throw new Error('preset mudou');
  tpl.data.buttons = tpl.data.buttons.map((b) => ({ ...b, optOut: false }));
  const v = validateFlow(g);
  assert.equal(v.canPublish, false);
  assert.ok(v.issues.some((i) => i.code === 'marketing_optout_button'));
});
