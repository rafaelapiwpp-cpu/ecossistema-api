/**
 * Montagem das dependências.
 *
 *   WHATSAPP_PROVIDER=mock  (padrão)  -> MemoryRepo + MockWhatsAppProvider + relógio acelerável
 *   WHATSAPP_PROVIDER=meta            -> PgRepo (a implementar) + MetaCloudProvider
 *
 * O resto do sistema só enxerga `DisparosService`.
 */
import { DisparosService, Clock } from './service';
import { MemoryRepo } from './memory-repo';
import { DEMO_PHONE_MAIN, DEMO_TENANT, seedCatalog, seedFlows } from './seed';
import { MockWhatsAppProvider, SimulatedClock } from '../whatsapp/mock-provider';
import { MetaCloudProvider } from '../whatsapp/meta-cloud';
import type { DisparosRepo } from './repo';
import type { DisparosContainer } from './container-types';
import type { ID } from './entities';

export type { DisparosContainer };
/** Container em memória (testes e demo local), com acesso ao relógio e ao repo. */
export interface MockContainer extends DisparosContainer {
  mock: { provider: MockWhatsAppProvider; clock: SimulatedClock; repo: MemoryRepo };
}

const HOUR = 3600_000;

export async function createMockContainer(opts: { speed?: number; withHistory?: boolean; realNow?: () => number } = {}): Promise<MockContainer> {
  const realNow = opts.realNow ?? (() => Date.now());
  const real = realNow();
  const clock = new SimulatedClock(opts.withHistory === false ? real : real - 3 * 24 * HOUR, 0, realNow);
  const repo = new MemoryRepo();
  seedCatalog(repo, real);
  seedFlows(repo, real);

  const provider = new MockWhatsAppProvider({
    clock,
    displayPhone: (id) => repo.phoneNumbers.find((p) => p.phoneNumberId === id)?.displayPhoneNumber ?? '',
    templateInfo: (name) => {
      const t = repo.templates.find((x) => x.name === name);
      return t ? { category: t.category, buttons: t.buttons } : undefined;
    },
  });
  const service = new DisparosService({ repo, provider, clock });

  let ticking: Promise<void> | null = null;
  const tick = async () => {
    if (ticking) return ticking;            // evita ticks sobrepostos
    ticking = (async () => {
      await provider.pump(clock.now(), (p) => service.handleWebhook(p));
      await service.tick();
      await provider.pump(clock.now(), (p) => service.handleWebhook(p));
    })().finally(() => { ticking = null; });
    return ticking;
  };

  if (opts.withHistory !== false) await seedHistory(service, clock, tick, real);
  clock.setSpeed(opts.speed ?? 10);

  return {
    service,
    tick,
    getTenantId: (req) => req.headers.get('x-tenant-id') ?? DEMO_TENANT,
    mock: { provider, clock, repo },
    sim: {
      speed: () => clock.speed,
      setSpeed: (s) => clock.setSpeed(s),
      pendingEvents: () => provider.pending(),
      simulateInbound: async (phone, text, phoneNumberId) => {
        const pn = repo.phoneNumbers.find((p) => p.id === phoneNumberId) ?? repo.phoneNumbers[0];
        if (!pn) return;
        await provider.simulateInbound(pn.phoneNumberId, phone, text);
      },
    },
  };
}

/** Roda o simulador "no passado" para a demo abrir com campanhas concluídas e uma em andamento. */
async function seedHistory(service: DisparosService, clock: SimulatedClock, tick: () => Promise<void>, real: number) {
  const ff = async (until: number) => {
    while (clock.now() < until) {
      const busy = (await service.listCampaigns(DEMO_TENANT)).some((c) => c.campaign.status === 'running' && c.stats.queued > 0);
      clock.advanceBy(Math.min(busy ? 2_000 : 60_000, until - clock.now()));
      await tick();
    }
  };
  await service.createCampaign(DEMO_TENANT, {
    name: 'Confirmações da semana 44', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_confirmacao',
    audience: { tags: ['consultas-semana'] }, ratePerMinute: 30, startNow: true,
  });
  await ff(real - 30 * HOUR);
  await service.createCampaign(DEMO_TENANT, {
    name: 'Lembrete de retorno — outubro', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_retorno',
    audience: { tags: ['retorno-6-meses'] }, ratePerMinute: 60, startNow: true,
  });
  await ff(real - 7 * 60_000);
  await service.createCampaign(DEMO_TENANT, {
    name: 'Promo novembro — leads do Instagram', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_promo',
    audience: { tags: ['leads-instagram'] }, ratePerMinute: 40, startNow: true,
  });
  await ff(real);
  const tomorrow9 = new Date(real + 24 * HOUR);
  tomorrow9.setUTCHours(12, 0, 0, 0);       // 9h em Brasília
  await service.createCampaign(DEMO_TENANT, {
    name: 'Confirmações da semana 45', phoneNumberId: DEMO_PHONE_MAIN, flowId: 'flow_confirmacao',
    audience: { tags: ['consultas-semana'] }, ratePerMinute: 30, scheduledAt: tomorrow9.getTime(),
  });
}

/** Esqueleto do modo real. Falta só o PgRepo (contrato em repo.ts). */
export function createMetaContainer(deps: {
  repo: DisparosRepo;
  getAccessToken: (phoneNumberId: string) => Promise<string>;
  getTenantId: (req: Request) => ID;
  verifyToken: string;
  appSecret: string;
}): DisparosContainer {
  const clock: Clock = { now: () => Date.now() };
  const provider = new MetaCloudProvider({ getAccessToken: deps.getAccessToken });
  const service = new DisparosService({ repo: deps.repo, provider, clock });
  return {
    service,
    getTenantId: deps.getTenantId,
    tick: async () => { await service.tick(); },
    webhook: { verifyToken: deps.verifyToken, appSecret: deps.appSecret },
  };
}
