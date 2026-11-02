/**
 * Container usado pelo app (rotas do Next). Três modos:
 *
 *   sem DATABASE_URL                -> demonstração em memória (dev local sem banco)
 *   DATABASE_URL, provider padrão   -> SIMULAÇÃO persistida no Neon: tudo é gravado nas
 *                                      tabelas reais; nada sai para a Meta. Os status e
 *                                      respostas chegam como webhooks no formato da Meta.
 *   WHATSAPP_PROVIDER=meta          -> Meta Cloud API oficial (mesmo banco, mesmo service).
 *
 * As telas e o DisparosService não mudam entre os modos.
 */
import { prisma } from '@/lib/db';
import { DisparosService, HttpError } from './service';
import { OPERATOR_SCOPE, PrismaRepo } from './prisma-repo';
import { PrismaSimQueue, withLease } from './prisma-sim';
import { createMockContainer } from './mock-container';
import type { DisparosContainer } from './container-types';
import { MockWhatsAppProvider } from '../whatsapp/mock-provider';
import { MetaCloudProvider } from '../whatsapp/meta-cloud';

const g = globalThis as unknown as { __disparos?: Promise<DisparosContainer> };

export function getDisparosContainer(): Promise<DisparosContainer> {
  return (g.__disparos ??= build());
}

async function build(): Promise<DisparosContainer> {
  if (!process.env.DATABASE_URL) return createMockContainer({ speed: 10 });

  const clock = { now: () => Date.now() };
  const workerSecret = process.env.WORKER_SECRET || undefined;
  // v1: operador único, sem auth (doc 05). A sessão real entra com o doc 04.
  const getTenantId = () => OPERATOR_SCOPE;

  if (process.env.WHATSAPP_PROVIDER === 'meta') {
    const token = process.env.META_SYSTEM_USER_TOKEN;
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    const appSecret = process.env.META_APP_SECRET;
    if (!token || !verifyToken || !appSecret) {
      throw new Error('WHATSAPP_PROVIDER=meta exige META_SYSTEM_USER_TOKEN, META_WEBHOOK_VERIFY_TOKEN e META_APP_SECRET.');
    }
    const repo = new PrismaRepo(prisma, { providerKind: 'meta' });
    // TODO(segurança, doc 04 §1): token por WABA, cifrado em credencial_meta.
    const provider = new MetaCloudProvider({ getAccessToken: async () => token });
    const service = new DisparosService({ repo, provider, clock });
    return {
      service, getTenantId, workerSecret,
      webhook: { verifyToken, appSecret },
      tick: async () => { await withLease(prisma, 'disparos', 50_000, () => service.tick().then(() => undefined)); },
    };
  }

  const repo = new PrismaRepo(prisma, { providerKind: 'mock' });
  const provider = new MockWhatsAppProvider({
    clock,
    displayPhone: () => '',
    // atrasos simulados (entrega, leitura, resposta) encurtados para a demo andar
    timeScale: Number(process.env.SIM_TIME_SCALE ?? 0.1) || 0.1,
    queue: new PrismaSimQueue(prisma),
  });
  const service = new DisparosService({ repo, provider, clock });
  return {
    service, getTenantId, workerSecret,
    tick: async () => {
      await withLease(prisma, 'disparos', 50_000, async () => {
        await provider.pump(clock.now(), (p) => service.handleWebhook(p));
        await service.tick();
        await provider.pump(clock.now(), (p) => service.handleWebhook(p));
      });
    },
    sim: {
      speed: () => null,
      pendingEvents: () => provider.pending(),
      simulateInbound: async (phone, text, phoneNumberId) => {
        const pn = phoneNumberId
          ? await repo.getPhoneNumber(OPERATOR_SCOPE, phoneNumberId)
          : (await repo.listPhoneNumbers(OPERATOR_SCOPE))[0];
        if (!pn) throw new HttpError(422, 'Cadastre um número em Números para simular respostas.');
        await provider.simulateInbound(pn.phoneNumberId, phone, text);
      },
    },
  };
}
