import {
  MESSAGING_LIMIT_VALUE,
  SEVERITY_RANK,
  effectiveLimits,
  type Alert,
  type AlertSeverity,
  type BusinessConnectionStatus,
  type BusinessManagerOwnership,
  type BusinessVerificationStatus,
  type E164,
  type HealthStatus,
  type ISODate,
  type ISODateTime,
  type MessagingLimitTier,
  type PhoneNumber,
  type PhoneNumberStatus,
  type QualityRating,
  type ServiceHealth,
  type TenantStatus,
  type BillingStatus,
  type ThroughputLevel,
} from "../domain";
import type { DataSource } from "../data/datasource";
import { DAY_MS, addDays, localDate, startOfLocalMonth } from "../time";
import { isSyntheticBm, UNASSIGNED_TENANT_ID } from "../data/postgres/mappers";

/**
 * Read model da tela "Visão geral" do painel admin.
 *
 * É o contrato entre dados e tela: a página faz uma chamada e recebe tudo
 * já agregado e serializável (pode atravessar Server -> Client Component).
 * A tela não conhece repositórios nem faz contas de negócio.
 */

export interface FleetNumber {
  id: string;
  phone: E164;
  label: string | null;
  quality: QualityRating;
  status: PhoneNumberStatus;
  throughput: ThroughputLevel;
  sendingEnabled: boolean;
  sent24h: number;
  /** null quando não houve envio. */
  deliveryRate24h: number | null;
}

export interface FleetBusinessManager {
  id: string;
  name: string;
  ownership: BusinessManagerOwnership;
  verification: BusinessVerificationStatus;
  connection: BusinessConnectionStatus;
  tier: MessagingLimitTier;
  limit: number | null;
  recipients24h: number;
  /** recipients24h / limit; null quando ilimitado. */
  limitUsage: number | null;
  numbers: FleetNumber[];
  /** Agrupador de números sem BM vinculada no banco — não é uma BM da Meta. */
  placeholder: boolean;
}

export interface FleetTenant {
  tenantId: string;
  name: string;
  status: TenantStatus;
  planName: string;
  businessManagers: FleetBusinessManager[];
}

export interface VolumeDay {
  date: ISODate;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  /** Dia corrente, ainda acumulando. */
  isPartial: boolean;
}

export interface AlertView extends Alert {
  tenantName: string | null;
}

export type AlertCounts = Record<AlertSeverity, number>;

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  billingStatus: BillingStatus;
  planName: string;
  numbersConnected: number;
  numbersTotal: number;
  worstQuality: QualityRating;
  monthToDateSent: number;
  monthlyQuota: number;
  quotaUsage: number;
  contacts: number;
  optedOutShare: number;
  /** Opt-outs / entregues nos últimos 30 dias. */
  optOutRate30d: number;
  campaignsRunning: number;
  alerts: AlertCounts;
  customDomain: string | null;
}

export interface AdminOverview {
  generatedAt: ISODateTime;
  dataSource: DataSource["kind"];
  attention: {
    tenants: Array<{ id: string; name: string }>;
    worstInfraStatus: HealthStatus;
    infraIssues: Array<{ name: string; status: HealthStatus }>;
  };
  kpis: {
    tenants: { total: number; active: number; trial: number; pastDue: number; suspended: number };
    businessManagers: { total: number; verified: number; awaitingVerification: number };
    phoneNumbers: { total: number; connected: number; lowQuality: number; mediumQuality: number; offline: number };
    messages24h: { sent: number; delivered: number; read: number; failed: number; deliveryRate: number; readRate: number; sentPrevious24h: number };
    optOuts24h: { count: number; rate: number };
    campaigns: { running: number; scheduled: number; autoPaused: number };
  };
  fleet: FleetTenant[];
  volume: VolumeDay[];
  infra: ServiceHealth[];
  alerts: AlertView[];
  tenants: TenantRow[];
}

const QUALITY_RANK: Record<QualityRating, number> = { RED: 0, YELLOW: 1, UNKNOWN: 2, GREEN: 3 };
const HEALTH_RANK: Record<HealthStatus, number> = { down: 0, degraded: 1, maintenance: 2, operational: 3 };
const OFFLINE: PhoneNumberStatus[] = ["DISCONNECTED", "BANNED", "DELETED", "UNVERIFIED", "PENDING"];
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Número com problema de qualidade/estado que exige ação. */
export function isLowQuality(n: Pick<PhoneNumber, "qualityRating" | "status">): boolean {
  return n.qualityRating === "RED" || n.status === "FLAGGED" || n.status === "RESTRICTED";
}

export async function getAdminOverview(ds: DataSource, options: { volumeDays?: number } = {}): Promise<AdminOverview> {
  const now = ds.clock.now();
  const today = localDate(now);
  const volumeDays = options.volumeDays ?? 14;
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const twoDaysAgo = new Date(now.getTime() - 2 * DAY_MS);

  const [plans, tenants, bms, numbers, campaigns, consent, hourly, daily, usage, services, alerts] = await Promise.all([
    ds.plans.list(),
    ds.tenants.list(),
    ds.businessManagers.list(),
    ds.phoneNumbers.list(),
    ds.campaigns.list({ status: ["running", "scheduled", "paused"] }),
    ds.leads.countByConsent(),
    ds.metrics.hourlyByNumber({ from: twoDaysAgo, to: now }),
    ds.metrics.dailyByNumber({ from: addDays(today, -30), to: today }),
    ds.metrics.portfolioUsage(now),
    ds.infra.services(),
    ds.alerts.listOpen(),
  ]);

  const planById = new Map(plans.map((p) => [p.id, p]));
  const tenantName = new Map(tenants.map((t) => [t.id, t.tradeName]));
  const usageByBm = new Map(usage.map((u) => [u.businessManagerId, u]));

  /* ---------- Janela de 24 h (e as 24 h anteriores) ---------- */
  const cur = { sent: 0, delivered: 0, read: 0, failed: 0, optOuts: 0 };
  let sentPrevious24h = 0;
  const perNumber = new Map<string, { sent: number; delivered: number }>();
  for (const h of hourly) {
    const t = new Date(h.hour);
    if (t >= dayAgo) {
      cur.sent += h.sent;
      cur.delivered += h.delivered;
      cur.read += h.read;
      cur.failed += h.failed;
      cur.optOuts += h.optOuts;
      const n = perNumber.get(h.phoneNumberId) ?? { sent: 0, delivered: 0 };
      n.sent += h.sent;
      n.delivered += h.delivered;
      perNumber.set(h.phoneNumberId, n);
    } else {
      sentPrevious24h += h.sent;
    }
  }

  /* ---------- Série diária ---------- */
  const firstDay = addDays(today, -(volumeDays - 1));
  const volumeByDate = new Map<string, VolumeDay>();
  for (let i = 0; i < volumeDays; i++) {
    const date = addDays(firstDay, i);
    volumeByDate.set(date, { date, sent: 0, delivered: 0, read: 0, failed: 0, isPartial: date === today });
  }
  const monthStart = startOfLocalMonth(now);
  const monthSent = new Map<string, number>();
  const thirtyDay = new Map<string, { delivered: number; optOuts: number }>();
  for (const d of daily) {
    const v = volumeByDate.get(d.date);
    if (v) {
      v.sent += d.sent;
      v.delivered += d.delivered;
      v.read += d.read;
      v.failed += d.failed;
    }
    if (d.date >= monthStart) monthSent.set(d.tenantId, (monthSent.get(d.tenantId) ?? 0) + d.sent);
    if (d.date > addDays(today, -30)) {
      const acc = thirtyDay.get(d.tenantId) ?? { delivered: 0, optOuts: 0 };
      acc.delivered += d.delivered;
      acc.optOuts += d.optOuts;
      thirtyDay.set(d.tenantId, acc);
    }
  }

  /* ---------- Alertas por tenant ---------- */
  const alertCounts = new Map<string, AlertCounts>();
  for (const a of alerts) {
    if (!a.tenantId) continue;
    const c = alertCounts.get(a.tenantId) ?? { critical: 0, serious: 0, warning: 0 };
    c[a.severity] += 1;
    alertCounts.set(a.tenantId, c);
  }
  const attentionScore = (id: string) => {
    const c = alertCounts.get(id);
    return c ? c.critical * 100 + c.serious * 10 + c.warning : 0;
  };

  /* ---------- Ordem: quem precisa de atenção primeiro, depois volume ---------- */
  const orderedTenants = [...tenants].sort(
    (a, b) => attentionScore(b.id) - attentionScore(a.id) || (monthSent.get(b.id) ?? 0) - (monthSent.get(a.id) ?? 0),
  );

  const toFleetNumber = (n: PhoneNumber): FleetNumber => {
    const s = perNumber.get(n.id);
    return {
      id: n.id,
      phone: n.displayPhoneNumber,
      label: n.label,
      quality: n.qualityRating,
      status: n.status,
      throughput: n.throughput,
      sendingEnabled: n.sendingEnabled,
      sent24h: s?.sent ?? 0,
      deliveryRate24h: s && s.sent > 0 ? s.delivered / s.sent : null,
    };
  };

  const fleet: FleetTenant[] = orderedTenants.map((t) => ({
    tenantId: t.id,
    name: t.tradeName,
    status: t.status,
    planName: planById.get(t.planId)?.name ?? "—",
    businessManagers: bms
      .filter((b) => b.tenantId === t.id)
      .map((b) => {
        const u = usageByBm.get(b.id);
        const limit = MESSAGING_LIMIT_VALUE[b.messagingLimitTier];
        return {
          id: b.id,
          name: b.name,
          ownership: b.ownership,
          verification: b.verificationStatus,
          connection: b.connectionStatus,
          tier: b.messagingLimitTier,
          limit,
          recipients24h: u?.uniqueRecipients ?? 0,
          limitUsage: limit ? ratio(u?.uniqueRecipients ?? 0, limit) : null,
          numbers: numbers.filter((n) => n.businessManagerId === b.id).map(toFleetNumber),
          placeholder: isSyntheticBm(b.id),
        };
      }),
  }));

  const tenantRows: TenantRow[] = orderedTenants.map((t) => {
    const plan = planById.get(t.planId);
    const own = numbers.filter((n) => n.tenantId === t.id);
    const quota = plan ? effectiveLimits(plan, t).monthlyMessages : 0;
    const counts = consent.filter((c) => c.tenantId === t.id);
    const contacts = counts.reduce((a, c) => a + c.count, 0);
    const optedOut = counts.find((c) => c.status === "opted_out")?.count ?? 0;
    const td = thirtyDay.get(t.id);
    const used = monthSent.get(t.id) ?? 0;
    return {
      id: t.id,
      name: t.tradeName,
      slug: t.slug,
      status: t.status,
      billingStatus: t.billingStatus,
      planName: plan?.name ?? "—",
      numbersConnected: own.filter((n) => n.status === "CONNECTED" || n.status === "FLAGGED").length,
      numbersTotal: own.length,
      worstQuality: own.reduce<QualityRating>((w, n) => (QUALITY_RANK[n.qualityRating] < QUALITY_RANK[w] ? n.qualityRating : w), "GREEN"),
      monthToDateSent: used,
      monthlyQuota: quota,
      quotaUsage: ratio(used, quota),
      contacts,
      optedOutShare: ratio(optedOut, contacts),
      optOutRate30d: ratio(td?.optOuts ?? 0, td?.delivered ?? 0),
      campaignsRunning: campaigns.filter((c) => c.tenantId === t.id && c.status === "running").length,
      alerts: alertCounts.get(t.id) ?? { critical: 0, serious: 0, warning: 0 },
      customDomain: t.branding.customDomainStatus === "active" ? t.branding.customDomain : null,
    };
  });

  // Agrupadores sintéticos (órfãos do banco) aparecem na frota e na tabela, mas não contam como cliente/BM.
  const realTenants = tenants.filter((t) => t.id !== UNASSIGNED_TENANT_ID);
  const realBms = bms.filter((b) => !isSyntheticBm(b.id));

  const infraIssues = services.filter((s) => s.status !== "operational").map((s) => ({ name: s.name, status: s.status }));
  const worstInfraStatus = services.reduce<HealthStatus>((w, s) => (HEALTH_RANK[s.status] < HEALTH_RANK[w] ? s.status : w), "operational");

  return {
    generatedAt: now.toISOString(),
    dataSource: ds.kind,
    attention: {
      tenants: orderedTenants
        .filter((t) => {
          const c = alertCounts.get(t.id);
          return c && c.critical + c.serious > 0;
        })
        .map((t) => ({ id: t.id, name: t.tradeName })),
      worstInfraStatus,
      infraIssues,
    },
    kpis: {
      tenants: {
        total: realTenants.length,
        active: realTenants.filter((t) => t.status === "active").length,
        trial: realTenants.filter((t) => t.status === "trial").length,
        pastDue: realTenants.filter((t) => t.status === "past_due").length,
        suspended: realTenants.filter((t) => t.status === "suspended").length,
      },
      businessManagers: {
        total: realBms.length,
        verified: realBms.filter((b) => b.verificationStatus === "verified").length,
        awaitingVerification: realBms.filter((b) => b.verificationStatus === "pending" || b.verificationStatus === "not_verified").length,
      },
      phoneNumbers: {
        total: numbers.length,
        connected: numbers.filter((n) => n.status === "CONNECTED" || n.status === "FLAGGED").length,
        lowQuality: numbers.filter(isLowQuality).length,
        mediumQuality: numbers.filter((n) => n.qualityRating === "YELLOW" && !isLowQuality(n)).length,
        offline: numbers.filter((n) => OFFLINE.includes(n.status)).length,
      },
      messages24h: {
        ...cur,
        deliveryRate: ratio(cur.delivered, cur.sent),
        readRate: ratio(cur.read, cur.delivered),
        sentPrevious24h,
      },
      optOuts24h: { count: cur.optOuts, rate: ratio(cur.optOuts, cur.delivered) },
      campaigns: {
        running: campaigns.filter((c) => c.status === "running").length,
        scheduled: campaigns.filter((c) => c.status === "scheduled").length,
        autoPaused: campaigns.filter((c) => c.status === "paused" && c.pauseReason !== "manual").length,
      },
    },
    fleet,
    volume: [...volumeByDate.values()],
    infra: services,
    alerts: alerts
      .map((a) => ({ ...a, tenantName: a.tenantId ? (tenantName.get(a.tenantId) ?? null) : null }))
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.openedAt < b.openedAt ? 1 : -1)),
    tenants: tenantRows,
  };
}
