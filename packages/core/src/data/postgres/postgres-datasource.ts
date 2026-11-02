import { asId, MESSAGING_LIMIT_VALUE, type BusinessManager, type PhoneNumber, type Plan, type ServiceHealth, type Tenant } from "../../domain";
import { deriveAlerts } from "../../rules/alerts";
import { DAY_MS } from "../../time";
import type { Clock, DataSource, TenantFilter } from "../datasource";
import { PLAN_SPECS } from "../plans";
import {
  isSyntheticBm,
  syntheticBm,
  toBusinessManager,
  toPhoneNumber,
  toTemplate,
  toTenant,
  UNASSIGNED_TENANT_ID,
  unassignedTenant,
} from "./mappers";
import type { ContingencyStore } from "./rows";

/**
 * DataSource sobre o Postgres (Neon), lendo as tabelas de contingência do
 * schema Prisma de apps/admin.
 *
 * O que existe no banco hoje: clientes, BMs, números, templates. O que ainda
 * não existe (mensagens, rollups, campanhas, leads, WABAs) volta vazio — nunca
 * inventado. As telas mostram zero/estado vazio até os módulos de disparo
 * gravarem essas tabelas.
 *
 * Exceção declarada: o uso do limite 24 h da BM é estimado somando
 * `numero.enviadasHoje` dos números da BM (o operador digita esse valor).
 * Quando houver rollups horários, troca para destinatários únicos reais.
 */

interface Snapshot {
  now: Date;
  tenants: Tenant[];
  businessManagers: BusinessManager[];
  phoneNumbers: PhoneNumber[];
  templates: ReturnType<typeof toTemplate>[];
  sentTodayByBm: Map<string, number>;
}

/** Uma tela chama vários métodos em paralelo; todos compartilham a mesma leitura por este intervalo. */
const SNAPSHOT_TTL_MS = 1_500;

export function createPostgresDataSource(store: ContingencyStore, options: { clock?: Clock } = {}): DataSource {
  const clock: Clock = options.clock ?? { now: () => new Date() };
  let cached: { at: number; value: Promise<Snapshot> } | null = null;

  const load = async (): Promise<Snapshot> => {
    const now = clock.now();
    const [clientes, bms, numeros, templateRows] = await Promise.all([store.clientes(), store.bms(), store.numeros(), store.templates()]);

    const tenants = clientes.map(toTenant);
    const tenantName = new Map(clientes.map((c) => [c.id, c.nome]));
    const businessManagers = bms.map(toBusinessManager);
    const bmById = new Map(bms.map((b) => [b.id, b]));

    const synthetic = new Map<string, BusinessManager>();
    const sentTodayByBm = new Map<string, number>();
    const phoneNumbers = numeros.map((n) => {
      const bm = n.bmId ? bmById.get(n.bmId) : undefined;
      const tenantId = n.clienteId ?? bm?.clienteId ?? UNASSIGNED_TENANT_ID;
      let bmId = bm?.id;
      if (!bmId) {
        const s = synthetic.get(tenantId) ?? syntheticBm(tenantId, now);
        synthetic.set(tenantId, s);
        bmId = s.id;
      }
      sentTodayByBm.set(bmId, (sentTodayByBm.get(bmId) ?? 0) + Math.max(0, n.enviadasHoje));
      return toPhoneNumber(n, { tenantId, bmId, verifiedName: tenantName.get(tenantId) ?? "" });
    });
    businessManagers.push(...synthetic.values());

    const templates = templateRows.map(toTemplate);

    const referenced = [...businessManagers, ...phoneNumbers, ...templates].some((x) => x.tenantId === UNASSIGNED_TENANT_ID);
    if (referenced) tenants.push(unassignedTenant(now));

    return { now, tenants, businessManagers, phoneNumbers, templates, sentTodayByBm };
  };

  const snapshot = () => {
    const t = Date.now();
    if (!cached || t - cached.at > SNAPSHOT_TTL_MS) {
      cached = { at: t, value: load() };
      cached.value.catch(() => (cached = null));
    }
    return cached.value;
  };

  const byTenant = <T extends { tenantId: string }>(rows: T[], filter?: TenantFilter) =>
    filter?.tenantId ? rows.filter((r) => r.tenantId === filter.tenantId) : rows;

  const plans = (): Plan[] =>
    PLAN_SPECS.map((p) => ({ id: asId<Plan["id"]>(`pln_${p.code}`), ...p, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }));

  const portfolioUsage = (s: Snapshot, at: Date) =>
    s.businessManagers.map((bm) => ({
      businessManagerId: bm.id,
      windowStart: new Date(at.getTime() - DAY_MS).toISOString(),
      windowEnd: at.toISOString(),
      uniqueRecipients: s.sentTodayByBm.get(bm.id) ?? 0,
      limit: MESSAGING_LIMIT_VALUE[bm.messagingLimitTier],
    }));

  const databaseHealth = async (): Promise<ServiceHealth> => {
    const started = Date.now();
    const checkedAt = new Date().toISOString();
    try {
      await store.ping();
      return { key: "database", name: "Banco de dados", status: "operational", primary: { label: "consulta", value: Date.now() - started, unit: "ms" }, detail: null, checkedAt };
    } catch (e) {
      return {
        key: "database",
        name: "Banco de dados",
        status: "down",
        primary: { label: "consulta", value: Date.now() - started, unit: "ms" },
        detail: `O Postgres não respondeu: ${e instanceof Error ? e.message.slice(0, 160) : "erro desconhecido"}`,
        checkedAt,
      };
    }
  };

  return {
    kind: "postgres",
    clock,
    plans: { list: async () => plans() },
    tenants: {
      list: async () => (await snapshot()).tenants,
      get: async (id) => (await snapshot()).tenants.find((t) => t.id === id) ?? null,
    },
    businessManagers: { list: async (f) => byTenant((await snapshot()).businessManagers, f) },
    wabas: { list: async () => [] },
    phoneNumbers: {
      list: async (f) => {
        const rows = byTenant((await snapshot()).phoneNumbers, f);
        return f?.businessManagerId ? rows.filter((n) => n.businessManagerId === f.businessManagerId) : rows;
      },
    },
    templates: {
      list: async (f) => {
        const rows = byTenant((await snapshot()).templates, f);
        return f?.status ? rows.filter((t) => f.status!.includes(t.status)) : rows;
      },
    },
    campaigns: { list: async () => [] },
    leads: {
      countByConsent: async () => [],
      list: async () => ({ items: [], nextCursor: null }),
    },
    metrics: {
      hourlyByNumber: async () => [],
      dailyByNumber: async () => [],
      portfolioUsage: async (at) => portfolioUsage(await snapshot(), at),
    },
    infra: { services: async () => [await databaseHealth()] },
    alerts: {
      listOpen: async (f) => {
        const s = await snapshot();
        const alerts = deriveAlerts({
          now: s.now,
          plans: plans(),
          tenants: s.tenants,
          // BMs sintéticas não existem na Meta: não geram alerta de verificação/limite.
          businessManagers: s.businessManagers.filter((b) => !isSyntheticBm(b.id)),
          phoneNumbers: s.phoneNumbers,
          templates: s.templates,
          campaigns: [],
          portfolioUsage: portfolioUsage(s, s.now).filter((u) => !isSyntheticBm(u.businessManagerId)),
          monthToDateSent: {},
          last24h: {},
          services: [await databaseHealth()],
        });
        return f?.tenantId ? alerts.filter((a) => a.tenantId === f.tenantId) : alerts;
      },
    },
  };
}
