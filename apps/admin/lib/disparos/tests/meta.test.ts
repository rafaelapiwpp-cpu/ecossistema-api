import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseMetaWebhook, verifyMetaSignature, verifySubscription, MetaWebhookPayload } from '../whatsapp/meta-webhook';
import { MetaCloudProvider, toMetaPayload } from '../whatsapp/meta-cloud';
import { WhatsAppApiError } from '../whatsapp/types';

const sample: MetaWebhookPayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA', changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '555133330000', phone_number_id: 'PNID' },
        contacts: [{ wa_id: '5551999990000', profile: { name: 'Ana' } }],
        statuses: [{
          id: 'wamid.A', status: 'failed', timestamp: '1761960000', recipient_id: '5551999990000',
          biz_opaque_callback_data: 'run:1|node:tpl',
          errors: [{ code: 131050, title: 'User has stopped marketing messages' }],
        }],
        messages: [
          { from: '5551999990000', id: 'wamid.B', timestamp: '1761960001', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'dx1|r|n|ok', title: 'Confirmar' } }, context: { id: 'wamid.X' } },
          { from: '5551999990000', id: 'wamid.C', timestamp: '1761960002', type: 'button', button: { payload: 'dx1|r|n|parar', text: 'Parar promoções' } },
          { from: '5551999990000', id: 'wamid.D', timestamp: '1761960003', type: 'text', text: { body: 'SAIR' } },
        ],
      },
    }],
  }],
};

test('parser normaliza status, botão interativo, quick reply de modelo e texto', () => {
  const ev = parseMetaWebhook(sample);
  assert.equal(ev.length, 4);
  const st = ev[0] as any;
  assert.deepEqual([st.kind, st.status, st.recipient, st.error.code, st.timestamp], ['status', 'failed', '+5551999990000', 131050, 1761960000000]);
  assert.deepEqual([ev[1]!.kind, (ev[1] as any).buttonPayload, (ev[1] as any).profileName, (ev[1] as any).contextWaMessageId], ['inbound', 'dx1|r|n|ok', 'Ana', 'wamid.X']);
  assert.equal((ev[2] as any).buttonPayload, 'dx1|r|n|parar');
  assert.equal((ev[3] as any).text, 'SAIR');
});

test('assinatura X-Hub-Signature-256', async () => {
  const raw = JSON.stringify(sample);
  const sig = 'sha256=' + createHmac('sha256', 'segredo').update(raw).digest('hex');
  assert.equal(await verifyMetaSignature(raw, sig, 'segredo'), true);
  assert.equal(await verifyMetaSignature(raw + ' ', sig, 'segredo'), false);
  assert.equal(await verifyMetaSignature(raw, null, 'segredo'), false);
});

test('verificação do endpoint (hub.challenge)', () => {
  const u = new URL('https://x/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=123');
  assert.equal(verifySubscription(u, 'tok'), '123');
  assert.equal(verifySubscription(u, 'outro'), null);
});

test('payloads de envio no formato da Cloud API', () => {
  const tpl = toMetaPayload({
    phoneNumberId: 'PNID', to: '+5551999990000', bizOpaqueCallbackData: 'run:1|node:tpl',
    message: { type: 'template', name: 'confirmacao_consulta', language: 'pt_BR', bodyParams: ['Ana', 'ter'], quickReplyPayloads: ['p0', 'p1'] },
  }) as any;
  assert.equal(tpl.to, '5551999990000');
  assert.equal(tpl.biz_opaque_callback_data, 'run:1|node:tpl');
  assert.deepEqual(tpl.template.language, { code: 'pt_BR' });
  assert.deepEqual(tpl.template.components[0], { type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: 'ter' }] });
  assert.deepEqual(tpl.template.components[2], { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'p1' }] });

  const btn = toMetaPayload({ phoneNumberId: 'P', to: '+55', message: { type: 'interactive_buttons', body: 'Ok?', buttons: [{ id: 'a', title: 'Sim' }] } }) as any;
  assert.deepEqual(btn.interactive.action.buttons[0], { type: 'reply', reply: { id: 'a', title: 'Sim' } });

  const audio = toMetaPayload({ phoneNumberId: 'P', to: '+55', message: { type: 'audio', mediaId: 'MID', voice: true } }) as any;
  assert.deepEqual(audio.audio, { id: 'MID', voice: true });
});

test('provider Meta: POST /v26.0/{id}/messages e erro tipado', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const ok = new MetaCloudProvider({
    getAccessToken: async () => 'TOKEN',
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.OK' }] }), { status: 200 });
    }) as unknown as typeof fetch,
  });
  const r = await ok.send({ phoneNumberId: '123', to: '+5551999990000', message: { type: 'text', body: 'oi' } });
  assert.equal(r.waMessageId, 'wamid.OK');
  assert.equal(calls[0]!.url, 'https://graph.facebook.com/v26.0/123/messages');
  assert.equal((calls[0]!.init.headers as Record<string, string>).Authorization, 'Bearer TOKEN');

  const bad = new MetaCloudProvider({
    getAccessToken: async () => 'T',
    fetchImpl: (async () => new Response(JSON.stringify({ error: { code: 130429, message: 'Rate limit hit' } }), { status: 400 })) as unknown as typeof fetch,
  });
  await assert.rejects(() => bad.send({ phoneNumberId: '1', to: '+55', message: { type: 'text', body: 'x' } }),
    (e: unknown) => e instanceof WhatsAppApiError && e.code === 130429 && e.retryable);
});
