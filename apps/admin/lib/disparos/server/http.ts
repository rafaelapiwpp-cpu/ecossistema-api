/**
 * Handlers HTTP com Request/Response padrão (Web API). Funcionam direto como
 * Route Handlers do Next.js App Router e também no preview (no navegador).
 *
 *   app/api/disparos/[...path]/route.ts      -> createDisparosHandler
 *   app/api/webhooks/whatsapp/route.ts       -> createWebhookHandler
 */
import type { DisparosContainer } from './container-types';
import { HttpError } from './service';
import { verifyMetaSignature, verifySubscription, MetaWebhookPayload } from '../whatsapp/meta-webhook';

type Handler = (req: Request) => Promise<Response>;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export function createDisparosHandler(getContainer: () => Promise<DisparosContainer>, basePath = '/api/disparos'): Handler {
  let lastTick = 0;
  return async (req) => {
    try {
      const c = await getContainer();
      const url = new URL(req.url);
      const parts = url.pathname.slice(basePath.length).split('/').filter(Boolean).map(decodeURIComponent);
      const t = c.getTenantId(req);
      const s = c.service;
      const body = async <T>() => (await req.json().catch(() => ({}))) as T;
      const m = req.method;

      // No mock, cada leitura empurra a simulação (dispensa processo em segundo plano).
      if (c.sim && Date.now() - lastTick > 1500) {
        lastTick = Date.now();
        await c.tick();
      }

      const [a, b, d] = parts;
      // ---- catálogo
      if (m === 'GET' && a === 'bootstrap') {
        const [phoneNumbers, templates, tags] = await Promise.all([s.listPhoneNumbers(t), s.listTemplates(t), s.listTags(t)]);
        return json({
          providerKind: s.providerKind, now: s.now(),
          sim: c.sim ? { speed: c.sim.speed(), pendingEvents: await c.sim.pendingEvents() } : null,
          phoneNumbers, templates, tags,
        });
      }

      // ---- fluxos
      if (a === 'flows') {
        if (!b && m === 'GET') return json(await s.listFlows(t));
        if (!b && m === 'POST') return json(await s.createFlow(t, await body()), 201);
        if (b && !d && m === 'GET') return json(await s.getFlow(t, b));
        if (b && !d && m === 'PUT') return json(await s.saveFlow(t, b, await body()));
        if (b && d === 'publish' && m === 'POST') return json(await s.publishFlow(t, b));
      }

      // ---- campanhas
      if (a === 'campaigns') {
        if (!b && m === 'GET') return json(await s.listCampaigns(t));
        if (!b && m === 'POST') return json(await s.createCampaign(t, await body()), 201);
        if (b === 'preview' && m === 'POST') return json(await s.audiencePreview(t, await body()));
        if (b && !d && m === 'GET') return json(await s.getCampaign(t, b));
        if (b && d === 'recipients' && m === 'GET') {
          return json(await s.listRecipients(t, b, {
            filter: url.searchParams.get('filter') ?? 'all',
            search: url.searchParams.get('search') ?? undefined,
            page: Number(url.searchParams.get('page') ?? 1),
          }));
        }
        if (b && d && ['start', 'pause', 'resume', 'cancel'].includes(d) && m === 'POST') {
          return json(await s.campaignAction(t, b, d as 'start' | 'pause' | 'resume' | 'cancel'));
        }
      }

      if (a === 'conversations' && b && m === 'GET') return json(await s.conversation(t, b));

      // ---- contatos e consentimento
      if (a === 'contacts') {
        if (!b && m === 'GET') {
          return json(await s.listContacts(t, {
            search: url.searchParams.get('search') ?? undefined,
            consent: url.searchParams.get('consent') ?? undefined,
            tag: url.searchParams.get('tag') ?? undefined,
            page: Number(url.searchParams.get('page') ?? 1),
          }));
        }
        if (b === 'import' && m === 'POST') return json(await s.importContacts(t, await body()), 201);
        if (b === 'sample' && m === 'POST') return json(await s.addSampleContacts(t), 201);
      }

      // ---- blacklist
      if (a === 'blacklist') {
        if (!b && m === 'GET') {
          return json(await s.listOptOuts(t, { search: url.searchParams.get('search') ?? undefined, includeRevoked: url.searchParams.get('revoked') === '1' }));
        }
        if (!b && m === 'POST') return json(await s.addOptOutManual(t, await body()), 201);
        if (b && d === 'revoke' && m === 'POST') return json(await s.revokeOptOut(t, b, (await body<{ reason: string }>()).reason));
      }

      // ---- worker (chame por cron no modo real, protegido por segredo)
      if (a === 'worker' && b === 'tick' && m === 'POST') {
        if (c.workerSecret && req.headers.get('authorization') !== `Bearer ${c.workerSecret}`) return json({ error: 'Não autorizado.' }, 401);
        await c.tick();
        return json({ ok: true });
      }

      // ---- simulador (só mock)
      if (a === 'sim' && c.sim) {
        if (!b && m === 'POST') {
          const { speed } = await body<{ speed: number }>();
          if (![1, 10, 60, 300].includes(speed) || !c.sim.setSpeed) throw new HttpError(422, 'Velocidade inválida.');
          c.sim.setSpeed(speed);
          return json({ speed });
        }
        if (b === 'inbound' && m === 'POST') {
          const { phone, text, phoneNumberId } = await body<{ phone: string; text: string; phoneNumberId?: string }>();
          if (!phone || !text?.trim()) throw new HttpError(422, 'Informe o telefone e a mensagem.');
          await c.sim.simulateInbound(phone, text, phoneNumberId);
          await c.tick();
          return json({ ok: true });
        }
      }

      return json({ error: 'Rota não encontrada.' }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, details: e.details ?? null }, e.status);
      console.error('[disparos]', e);
      return json({ error: 'Erro interno.' }, 500);
    }
  };
}

/** Webhook da Meta. GET = verificação; POST = eventos (assinatura obrigatória no modo meta). */
export function createWebhookHandler(getContainer: () => Promise<DisparosContainer>) {
  return {
    GET: async (req: Request) => {
      const c = await getContainer();
      const challenge = c.webhook ? verifySubscription(new URL(req.url), c.webhook.verifyToken) : null;
      return challenge ? new Response(challenge, { status: 200 }) : new Response('forbidden', { status: 403 });
    },
    POST: async (req: Request) => {
      const c = await getContainer();
      const raw = await req.text();
      if (c.webhook?.appSecret) {
        const ok = await verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), c.webhook.appSecret);
        if (!ok) return new Response('invalid signature', { status: 401 });
      }
      // Responda 200 rápido: a Meta reenvia se demorar. Em produção, grave em
      // webhook_events_raw e processe numa fila; aqui processamos direto.
      try {
        await c.service.handleWebhook(JSON.parse(raw) as MetaWebhookPayload);
      } catch (e) {
        console.error('[webhook whatsapp]', e);
      }
      return new Response('ok', { status: 200 });
    },
  };
}
