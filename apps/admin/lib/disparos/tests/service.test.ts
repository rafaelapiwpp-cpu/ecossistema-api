import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockContainer } from '../server/mock-container';
import { DEMO_PHONE_MAIN, DEMO_TENANT as T } from '../server/seed';
import { createDisparosHandler } from '../server/http';
import { buildStatusWebhook } from '../whatsapp/meta-webhook';

async function setup() {
  const c = await createMockContainer({ withHistory: false, speed: 0 });
  const step = async (ms: number) => { c.mock!.clock.advanceBy(ms); await c.tick(); };
  return { c, s: c.service, repo: c.mock!.repo, step };
}

test('disparo respeita a velocidade e acompanha status até concluir', async () => {
  const { s, step } = await setup();
  const camp = await s.createCampaign(T, { name: 'Teste', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_retorno', audience: { tags: ['consultas-semana'] }, ratePerMinute: 60, startNow: true });
  await step(10_000);
  let st = await s.campaignStats(T, (await s.getCampaign(T, camp.id)).campaign);
  assert.equal(st.total, 180);
  assert.equal(st.sent, 10, '60/min => 10 em 10s');
  for (let i = 0; i < 40; i++) await step(60_000);
  const det = await s.getCampaign(T, camp.id);
  st = det.stats;
  assert.equal(det.campaign.status, 'completed');
  assert.equal(st.queued, 0);
  assert.equal(st.percentDone, 100);
  assert.ok(st.delivered > 150 && st.read > 80, JSON.stringify(st));
  assert.equal(st.sent + st.failed + st.skipped, st.total);
});

test('SAIR no meio do fluxo: blacklist, encerra execução, confirma e some das próximas campanhas', async () => {
  const { c, s, step } = await setup();
  const camp = await s.createCampaign(T, { name: 'Conf', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_confirmacao', audience: { tags: ['consultas-semana'] }, ratePerMinute: 600, startNow: true });
  await step(5_000);
  const { rows } = await s.listRecipients(T, camp.id, { filter: 'sent' });
  const target = rows.find((r) => r.run?.status === 'waiting_reply')!;
  assert.ok(target, 'alguém aguardando resposta');

  c.mock!.provider.simulateInbound('110200300400501', target.phoneE164, 'Sair!');
  await step(100);

  const oo = await c.mock!.repo.getActiveOptOut(T, target.phoneE164);
  assert.equal(oo?.source, 'keyword');
  assert.equal(oo?.triggerText, 'Sair!');
  const run = await c.mock!.repo.getRun(T, target.flowRunId!);
  assert.equal(run?.status, 'opted_out');
  const conv = await s.conversation(T, target.phoneE164);
  assert.ok(conv.messages.some((m) => m.direction === 'out' && /não vai mais receber/.test(m.preview)), 'confirmação enviada');

  const next = await s.createCampaign(T, { name: 'Outra', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_retorno', audience: { tags: ['consultas-semana'] }, startNow: false });
  const skipped = await s.listRecipients(T, next.id, { filter: 'skipped' });
  assert.ok(skipped.rows.some((r) => r.phoneE164 === target.phoneE164 && r.status === 'skipped_optout'));
});

test('quem entra na blacklist depois de criada a campanha é pulado no envio', async () => {
  const { s, repo, step } = await setup();
  const camp = await s.createCampaign(T, { name: 'X', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_retorno', audience: { tags: ['vip'] }, ratePerMinute: 6000, startNow: true });
  const first = repo.contacts.find((ct) => ct.tags.includes('vip'))!;
  await s.addOptOutManual(T, { phone: first.phoneE164, reason: 'Pediu na recepção' });
  await step(2_000);
  const r = (await s.listRecipients(T, camp.id, { filter: 'skipped' })).rows.find((x) => x.phoneE164 === first.phoneE164);
  assert.equal(r?.status, 'skipped_optout');
  assert.equal(r?.waMessageId, null);
});

test('webhook duplicado não muda nada (idempotência)', async () => {
  const { c, s, step } = await setup();
  const camp = await s.createCampaign(T, { name: 'D', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_retorno', audience: { tags: ['vip'] }, ratePerMinute: 6000, startNow: true });
  for (let i = 0; i < 15; i++) await step(60_000);
  const r = (await s.listRecipients(T, camp.id, { filter: 'read' })).rows[0]!;
  const dup = buildStatusWebhook('110200300400501', '', { id: r.waMessageId!, status: 'delivered', timestamp: '1', recipient_id: r.phoneE164.slice(1) });
  await s.handleWebhook(dup);
  await s.handleWebhook(dup);
  const again = await c.mock!.repo.getRecipient(T, r.id);
  assert.equal(again?.status, 'read', '"delivered" atrasado não rebaixa "read"');
});

test('limite diário da Meta (TIER_250) freia o disparo', async () => {
  const { s, repo, step } = await setup();
  repo.businessAccounts[0]!.messagingLimitTier = 'TIER_250';
  const camp = await s.createCampaign(T, { name: 'L', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_retorno', audience: { all: true, tags: [] }, ratePerMinute: 6000, startNow: true });
  for (let i = 0; i < 5; i++) await step(60_000);
  const det = await s.getCampaign(T, camp.id);
  assert.ok(det.stats.sent + det.stats.failed <= 250, JSON.stringify(det.stats));
  assert.equal(det.campaign.blockedReason, 'messaging_limit');
  assert.equal(det.campaign.status, 'running');
});

test('editar o rascunho não afeta quem já está na campanha (versão congelada)', async () => {
  const { c, s, step } = await setup();
  const camp = await s.createCampaign(T, { name: 'V', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_confirmacao', audience: { tags: ['vip'] }, ratePerMinute: 6000, startNow: true });
  const { flow } = await s.getFlow(T, 'flow_confirmacao');
  const g = structuredClone(flow.draftGraph);
  (g.nodes.find((n) => n.id === 'ok')!.data as { text: string }).text = 'TEXTO NOVO';
  await s.saveFlow(T, 'flow_confirmacao', { graph: g });
  await step(3_000);
  const target = (await s.listRecipients(T, camp.id, { filter: 'all' })).rows.find((r) => r.run?.status === 'waiting_reply')!;
  c.mock!.provider.simulateInbound('110200300400501', target.phoneE164, 'confirmar');
  await step(100);
  const conv = await s.conversation(T, target.phoneE164);
  assert.ok(conv.messages.some((m) => m.preview.startsWith('Perfeito,')));
  assert.ok(!conv.messages.some((m) => m.preview === 'TEXTO NOVO'));
});

test('HTTP: rotas principais, 422 ao publicar rascunho com erro, 404 desconhecida', async () => {
  const { c } = await setup();
  const h = createDisparosHandler(async () => c);
  const get = (p: string) => h(new Request(`http://x/api/disparos${p}`));
  const boot = await (await get('/bootstrap')).json();
  assert.equal(boot.providerKind, 'mock');
  assert.equal(boot.phoneNumbers.length, 2);
  assert.equal((await get('/flows')).status, 200);
  const pub = await h(new Request('http://x/api/disparos/flows/flow_reativacao/publish', { method: 'POST' }));
  assert.equal(pub.status, 422);
  assert.ok((await pub.json()).details.issues.some((i: { code: string }) => i.code === 'outside_window'));
  assert.equal((await get('/nada')).status, 404);
  const bl = await h(new Request('http://x/api/disparos/blacklist', { method: 'POST', body: JSON.stringify({ phone: '51 99999-1234' }) }));
  assert.equal((await bl.json()).phoneE164, '+5551999991234');
});

test('consentimento: só opted_in recebe; sem opt-in e opt-out ficam fora', async () => {
  const { s } = await setup();
  const prev = await s.audiencePreview(T, { phoneNumberId: DEMO_PHONE_MAIN, audience: { tags: ['leads-instagram'] } });
  assert.equal(prev.noConsent, 20, 'seed tem 20 leads sem opt-in');
  assert.ok(prev.optedOut > 0);
  const camp = await s.createCampaign(T, { name: 'Leads', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_promo', audience: { tags: ['leads-instagram'] }, startNow: false });
  const st = (await s.getCampaign(T, camp.id)).stats;
  assert.equal(st.skippedNoConsent, 20);
  assert.equal(st.queued, prev.eligible);
});

test('importação exige origem do consentimento e nunca reativa quem saiu', async () => {
  const { s, repo } = await setup();
  await assert.rejects(s.importContacts(T, { text: '51999990001, Zé', consentSource: 'web_form', consentNote: '' }), /opt-in/);
  const out = repo.optOuts[0]!.phoneE164;
  const r = await s.importContacts(T, {
    text: `telefone,nome\n51999990001, Zé Novo\n${out}, Já saiu\n123, ruim\n51999990001, repetido`,
    tags: ['#Feira'], consentSource: 'web_form', consentNote: 'Formulário da feira, nov/2026',
  });
  assert.deepEqual(r, { created: 1, updated: 0, keptOptOut: 1, invalid: 1, duplicates: 1 });
  assert.equal((await repo.getContactByPhone(T, out))!.consent, 'opted_out');
  const novo = (await repo.getContactByPhone(T, '+5551999990001'))!;
  assert.equal(novo.consent, 'opted_in');
  assert.deepEqual(novo.tags, ['feira']);
  assert.equal(repo.consentEvents.filter((e) => e.phoneE164 === '+5551999990001').length, 1);
});

test('número sem aptidão não dispara', async () => {
  const { s, repo } = await setup();
  repo.phoneNumbers[0]!.canSend = false;
  await assert.rejects(s.createCampaign(T, { name: 'X', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_retorno', audience: { tags: ['vip'] }, startNow: true }), /não está apto/);
});
