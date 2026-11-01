import { asId, MESSAGING_LIMIT_VALUE, type Lead, type TenantId } from "../../domain";
import { deriveAlerts } from "../../rules/alerts";
import { DAY_MS, localDate, startOfLocalMonth } from "../../time";
import type { DataSource, TenantFilter } from "../datasource";
import { buildMockWorld, type MockWorld } from "./seed";
import { MOCK_NOW, TENANT_SPECS } from "./world";

/** Fração de destinatários únicos sobre mensagens enviadas (o limite da BM conta pessoas, não mensagens). */
const UNIQUE_RECIPIENT_RATIO = 0.9;

const byTenant = <T extends { tenantId: TenantId }>(rows: T[], filter?: TenantFilter) =>
  filter?.tenantId ? rows.filter((r) => r.tenantId === filter.tenantId) : rows;

/** Devolve cópias, como um banco faria: a tela nunca altera o "banco" em memória por acidente. */
const settle = <T>(value: T): Promise<T> => Promise.resolve(structuredClone(value));

export function createMockDataSource(options: { now?: Date } = {}): DataSource {
  const world: MockWorld = buildMockWorld(options.now ?? MOCK_NOW);
  const now = world.now;

  const sumHourly = (from: Date, to: Date) => {
    const acc: Record<string, { sent: number; delivered: number; optOuts: number }> = {};
    const bm: Record<string, number> = {};
    for (const h of world.hourly) {
      const t = new Date(h.hour);
      if (t < from || t >= to) continue;
      const row = (acc[h.tenantId] ??= { sent: 0, delivered: 0, optOuts: 0 });
      row.sent += h.sent;
      row.delivered += h.delivered;
      row.optOuts += h.optOuts;
      bm[h.businessManagerId] = (bm[h.businessManagerId] ?? 0) + h.sent;
    }
    return { byTenant: acc, byBm: bm };
  };

  const portfolioUsageAt = (at: Date) => {
    const windowStart = new Date(at.getTime() - DAY_MS);
    const { byBm } = sumHourly(windowStart, at);
    return world.businessManagers.map((bm) => ({
      businessManagerId: bm.id,
      windowStart: windowStart.toISOString(),
      windowEnd: at.toISOString(),
      uniqueRecipients: Math.round((byBm[bm.id] ?? 0) * UNIQUE_RECIPIENT_RATIO),
      limit: MESSAGING_LIMIT_VALUE[bm.messagingLimitTier],
    }));
  };

  // Alertas são derivados uma vez, como faria o worker de regras.
  const monthStart = startOfLocalMonth(now);
  const monthToDateSent: Record<string, number> = {};
  for (const d of world.daily) {
    if (d.date >= monthStart && d.date <= localDate(now)) monthToDateSent[d.tenantId] = (monthToDateSent[d.tenantId] ?? 0) + d.sent;
  }
  const last24 = sumHourly(new Date(now.getTime() - DAY_MS), now).byTenant;
  const alerts = deriveAlerts({
    now,
    plans: world.plans,
    tenants: world.tenants,
    businessManagers: world.businessManagers,
    phoneNumbers: world.phoneNumbers,
    templates: world.templates,
    campaigns: world.campaigns,
    portfolioUsage: portfolioUsageAt(now),
    monthToDateSent,
    last24h: Object.fromEntries(Object.entries(last24).map(([k, v]) => [k, { delivered: v.delivered, optOuts: v.optOuts }])),
    services: world.services,
  });

  return {
    kind: "mock",
    clock: { now: () => new Date(now) },

    plans: { list: () => settle(world.plans) },

    tenants: {
      list: () => settle(world.tenants),
      get: (id) => settle(world.tenants.find((t) => t.id === id) ?? null),
    },

    businessManagers: { list: (f) => settle(byTenant(world.businessManagers, f)) },
    wabas: { list: (f) => settle(byTenant(world.wabas, f)) },

    phoneNumbers: {
      list: (f) =>
        settle(byTenant(world.phoneNumbers, f).filter((n) => !f?.businessManagerId || n.businessManagerId === f.businessManagerId)),
    },

    templates: {
      list: (f) => settle(byTenant(world.templates, f).filter((t) => !f?.status || f.status.includes(t.status))),
    },

    campaigns: {
      list: (f) => settle(byTenant(world.campaigns, f).filter((c) => !f?.status || f.status.includes(c.status))),
    },

    leads: {
      countByConsent: (f) => settle(byTenant(world.consentCounts, f)),
      list: async ({ tenantId, limit, cursor }) => settle(virtualLeads(world, tenantId, Math.min(limit, 200), Number(cursor ?? 0))),
    },

    metrics: {
      hourlyByNumber: (range, f) =>
        settle(
          byTenant(world.hourly, f).filter((h) => {
            const t = new Date(h.hour);
            return t >= range.from && t < range.to;
          }),
        ),
      dailyByNumber: (range, f) => settle(byTenant(world.daily, f).filter((d) => d.date >= range.from && d.date <= range.to)),
      portfolioUsage: (at) => settle(portfolioUsageAt(at)),
    },

    infra: { services: () => settle(world.services) },

    alerts: { listOpen: (f) => settle(f?.tenantId ? alerts.filter((a) => a.tenantId === f.tenantId) : alerts) },
  };
}

/**
 * Contatos "virtuais": gerados sob demanda a partir do índice, coerentes com as
 * contagens de consentimento, sem materializar centenas de milhares de objetos.
 */
function virtualLeads(world: MockWorld, tenantId: TenantId, limit: number, offset: number) {
  const spec = TENANT_SPECS.find((s) => `tnt_${s.slug}` === tenantId);
  const counts = world.consentCounts.filter((c) => c.tenantId === tenantId);
  const total = counts.reduce((a, c) => a + c.count, 0);
  const optedOut = counts.find((c) => c.status === "opted_out")?.count ?? 0;
  const unknown = counts.find((c) => c.status === "unknown")?.count ?? 0;
  const items: Lead[] = [];

  for (let i = offset; i < Math.min(total, offset + limit); i++) {
    const slot = (i * 7919) % total;
    const status = slot < optedOut ? "opted_out" : slot < optedOut + unknown ? "unknown" : "opted_in";
    const created = new Date(world.now.getTime() - ((i % 400) + 1) * DAY_MS).toISOString();
    items.push({
      id: asId(`lead_${tenantId.slice(4)}_${i}`),
      tenantId,
      phone: `+55${spec?.ddd ?? "51"}90${String(i).padStart(7, "0")}`,
      name: null,
      email: null,
      attributes: {},
      tags: [],
      stage: slot % 97 === 0 ? "invalid" : slot % 11 === 0 ? "interested" : slot % 4 === 0 ? "replied" : "new",
      stageChangedAt: slot % 4 === 0 || slot % 11 === 0 ? created : null,
      consent: {
        status,
        source: status === "opted_out" ? "opt_out_button" : status === "opted_in" ? "web_form" : null,
        changedAt: status === "unknown" ? null : created,
      },
      lastInboundAt: null,
      anonymizedAt: null,
      createdAt: created,
      updatedAt: created,
      deletedAt: null,
    });
  }
  const next = offset + items.length;
  return { items, nextCursor: next < total ? String(next) : null };
}
