import {
  asId,
  type BusinessManager,
  type Campaign,
  type CampaignStats,
  type DailyNumberStats,
  type HourlyNumberStats,
  type MessageTemplate,
  type PhoneNumber,
  type Plan,
  type PricingCategory,
  type ServiceHealth,
  type TemplateButton,
  type Tenant,
  type WhatsAppBusinessAccount,
} from "../../domain";
import type { ConsentCount } from "../datasource";
import { DAY_MS, HOUR_MS, floorToHour, localDate, localHour, localWeekday } from "../../time";
import { createRng } from "./rng";
import {
  MOCK_HISTORY_DAYS,
  MOCK_NOW,
  OPT_OUT_BUTTON_TEXT,
  OPT_OUT_FOOTER,
  PLAN_SPECS,
  TENANT_SPECS,
  type NumberSpec,
  type TenantSpec,
} from "./world";

/** Tudo que o mock "persiste". Equivale ao conteúdo das tabelas no Postgres. */
export interface MockWorld {
  now: Date;
  plans: Plan[];
  tenants: Tenant[];
  businessManagers: BusinessManager[];
  wabas: WhatsAppBusinessAccount[];
  phoneNumbers: PhoneNumber[];
  templates: MessageTemplate[];
  campaigns: Campaign[];
  consentCounts: ConsentCount[];
  hourly: HourlyNumberStats[];
  daily: DailyNumberStats[];
  services: ServiceHealth[];
}

const iso = (d: Date) => d.toISOString();
const ago = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

/** Distribuição do volume ao longo do dia (hora local). */
const HOUR_PROFILE_RAW = [0.2, 0.1, 0.05, 0.05, 0.05, 0.1, 0.4, 1.2, 3.2, 6.5, 8.4, 8.0, 6.0, 6.4, 7.6, 8.2, 7.4, 6.6, 5.8, 5.0, 3.6, 2.4, 1.4, 0.7];
const HOUR_PROFILE_SUM = HOUR_PROFILE_RAW.reduce((a, b) => a + b, 0);
const HOUR_PROFILE = HOUR_PROFILE_RAW.map((v) => v / HOUR_PROFILE_SUM);

/** Domingo -> sábado. */
const WEEKDAY_FACTOR = [0.42, 1.0, 1.04, 1.0, 1.08, 0.97, 0.78];

/** Preços ILUSTRATIVOS (micros de BRL) só para o mock ter custo plausível. A tabela real vem do rate card da Meta. */
const MOCK_PRICE_MICROS: Record<PricingCategory, number> = {
  marketing: 350_000,
  utility: 45_000,
  authentication: 45_000,
  authentication_international: 0,
  service: 0,
};

const DEFAULT_DELIVERY = 0.975;

function digits(seed: string, length: number): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let out = "";
  while (out.length < length) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    out += String(h % 10);
  }
  return out;
}

export function buildMockWorld(now: Date = MOCK_NOW): MockWorld {
  const rng = createRng(20261031);

  /* ---------------- Planos ---------------- */
  const plans: Plan[] = PLAN_SPECS.map((p) => ({
    id: asId(`pln_${p.code}`),
    code: p.code,
    name: p.name,
    monthlyPriceCents: p.monthlyPriceCents,
    limits: p.limits,
    isPublic: p.isPublic,
    createdAt: iso(ago(now, 700)),
    updatedAt: iso(ago(now, 120)),
  }));

  const tenants: Tenant[] = [];
  const businessManagers: BusinessManager[] = [];
  const wabas: WhatsAppBusinessAccount[] = [];
  const phoneNumbers: PhoneNumber[] = [];
  const templates: MessageTemplate[] = [];
  const campaigns: Campaign[] = [];
  const consentCounts: ConsentCount[] = [];
  const hourly: HourlyNumberStats[] = [];

  for (const spec of TENANT_SPECS) {
    const tenantId = asId<Tenant["id"]>(`tnt_${spec.slug}`);
    const createdAt = ago(now, spec.createdDaysAgo);

    tenants.push({
      id: tenantId,
      slug: spec.slug,
      legalName: spec.legalName,
      tradeName: spec.tradeName,
      documentType: "cnpj",
      document: spec.document,
      status: spec.status,
      planId: asId(`pln_${spec.plan}`),
      limitsOverride: spec.limitsOverride ?? null,
      billingStatus: spec.billing,
      nextInvoiceAt: iso(new Date(Date.UTC(2026, 10, 10, 13))),
      owner: { name: spec.owner.name, email: spec.owner.email, phone: null },
      branding: {
        brandName: spec.tradeName,
        logoUrl: null,
        primaryColor: spec.brand.color,
        customDomain: spec.brand.customDomain,
        customDomainStatus: spec.brand.customDomainStatus,
      },
      compliance: {
        dpoEmail: `privacidade@${spec.slug}.example`,
        messageRetentionDays: 365,
        termsAcceptedVersion: "2026-08",
        termsAcceptedAt: iso(ago(now, Math.min(spec.createdDaysAgo, 60))),
      },
      sendingEnabled: spec.status !== "suspended",
      trialEndsAt: spec.status === "trial" ? iso(ago(now, spec.createdDaysAgo - 14)) : null,
      createdAt: iso(createdAt),
      updatedAt: iso(ago(now, spec.stoppedDaysAgo ?? 2)),
      deletedAt: null,
    });

    /* ---------------- BMs, WABAs e números ---------------- */
    const tenantNumbers: Array<{ number: PhoneNumber; spec: NumberSpec }> = [];

    spec.bms.forEach((bmSpec, j) => {
      const bmId = asId<BusinessManager["id"]>(`bm_${spec.slug}_${j + 1}`);
      const wabaId = asId<WhatsAppBusinessAccount["id"]>(`waba_${spec.slug}_${j + 1}`);
      const bmCreated = ago(now, Math.max(spec.createdDaysAgo - 2, 1));

      businessManagers.push({
        id: bmId,
        tenantId,
        metaBusinessId: digits(`bm${spec.slug}${j}`, 15),
        name: bmSpec.name,
        ownership: bmSpec.ownership,
        verificationStatus: bmSpec.verification,
        messagingLimitTier: bmSpec.tier,
        connectionStatus: bmSpec.connection ?? "active",
        accountStatus: "active",
        tokenExpiresAt: bmSpec.tokenExpiresInDays != null ? iso(ago(now, -bmSpec.tokenExpiresInDays)) : iso(ago(now, -48)),
        lastSyncedAt: iso(new Date(now.getTime() - (4 + j) * 60_000)),
        createdAt: iso(bmCreated),
        updatedAt: iso(ago(now, 1)),
      });

      wabas.push({
        id: wabaId,
        tenantId,
        businessManagerId: bmId,
        metaWabaId: digits(`waba${spec.slug}${j}`, 15),
        name: bmSpec.name,
        currency: "BRL",
        timezoneId: "America/Sao_Paulo",
        reviewStatus: bmSpec.verification === "rejected" ? "REJECTED" : "APPROVED",
        webhookSubscribed: true,
        createdAt: iso(bmCreated),
        updatedAt: iso(ago(now, 3)),
      });

      for (const n of bmSpec.numbers) {
        const qualityChangedAt = n.qualityChangedDaysAgo != null ? ago(now, n.qualityChangedDaysAgo) : null;
        const number: PhoneNumber = {
          id: asId(`pn_${spec.slug}_${n.suffix}`),
          tenantId,
          businessManagerId: bmId,
          wabaId,
          metaPhoneNumberId: digits(`pn${spec.slug}${n.suffix}`, 15),
          displayPhoneNumber: `+55${spec.ddd}90000${n.suffix}`,
          verifiedName: spec.tradeName,
          displayNameStatus: n.displayNameStatus ?? "APPROVED",
          qualityRating: n.quality,
          status: n.status,
          throughput: n.throughput ?? "STANDARD",
          isOfficialBusinessAccount: spec.plan === "enterprise",
          label: n.label,
          sendingEnabled: n.sendingEnabled ?? true,
          qualityChangedAt: qualityChangedAt ? iso(qualityChangedAt) : null,
          lastHealthCheckAt: iso(new Date(now.getTime() - 90_000)),
          createdAt: iso(bmCreated),
          updatedAt: iso(qualityChangedAt ?? ago(now, 5)),
        };
        phoneNumbers.push(number);
        tenantNumbers.push({ number, spec: n });
      }
    });

    /* ---------------- Templates ---------------- */
    const firstWaba = wabas.find((w) => w.tenantId === tenantId)!;
    for (const t of spec.templates) {
      const isMarketing = t.category === "MARKETING";
      const buttons: TemplateButton[] = isMarketing ? [{ type: "MARKETING_OPT_OUT", text: OPT_OUT_BUTTON_TEXT }] : [];
      const changedAt = ago(now, t.statusChangedDaysAgo ?? 20);
      templates.push({
        id: asId(`tpl_${spec.slug}_${t.name}`),
        tenantId,
        wabaId: firstWaba.id,
        metaTemplateId: t.status === "PENDING" && (t.statusChangedDaysAgo ?? 1) < 0.1 ? null : digits(`tpl${spec.slug}${t.name}`, 16),
        name: t.name,
        language: "pt_BR",
        category: t.category,
        status: t.status,
        qualityScore: t.quality ?? (t.status === "APPROVED" ? "GREEN" : "UNKNOWN"),
        rejectionReason: t.rejectionReason ?? null,
        content: { header: null, body: t.body, footer: isMarketing ? OPT_OUT_FOOTER : null, buttons },
        variableCount: (t.body.match(/\{\{\d+\}\}/g) ?? []).length,
        statusChangedAt: iso(changedAt),
        createdAt: iso(ago(now, (t.statusChangedDaysAgo ?? 20) + 1)),
        updatedAt: iso(changedAt),
      });
    }

    /* ---------------- Campanhas ---------------- */
    spec.campaigns.forEach((c, k) => {
      const target = tenantNumbers[c.numberIndex] ?? tenantNumbers[0]!;
      campaigns.push(buildCampaign(spec, c, k, target, now, rng));
    });

    /* ---------------- Consentimento (contagens) ---------------- */
    const optedOut = Math.round(spec.contacts * spec.optedOutPct);
    const unknown = Math.round(spec.contacts * 0.015);
    consentCounts.push(
      { tenantId, status: "opted_in", count: spec.contacts - optedOut - unknown },
      { tenantId, status: "opted_out", count: optedOut },
      { tenantId, status: "unknown", count: unknown },
    );

    /* ---------------- Estatísticas horárias ---------------- */
    const historyStart = floorToHour(ago(now, MOCK_HISTORY_DAYS));
    const currentHour = floorToHour(now);
    const stoppedAt = spec.stoppedDaysAgo != null ? ago(now, spec.stoppedDaysAgo) : null;

    for (const { number, spec: n } of tenantNumbers) {
      if (n.share <= 0) continue;
      const qualityChangedAt = number.qualityChangedAt ? new Date(number.qualityChangedAt) : null;

      for (let t = historyStart.getTime(); t < currentHour.getTime(); t += HOUR_MS) {
        const at = new Date(t);
        if (at < createdAt) continue;

        let volume = spec.dailyVolume * n.share * WEEKDAY_FACTOR[localWeekday(at)]! * HOUR_PROFILE[localHour(at)]!;
        const daysAgo = (now.getTime() - t) / DAY_MS;
        volume *= 1 + 0.004 * (MOCK_HISTORY_DAYS - daysAgo); // crescimento leve
        volume *= rng.between(0.85, 1.15);
        if (spec.recentVolume && now.getTime() - t <= spec.recentVolume.hours * HOUR_MS) volume *= spec.recentVolume.factor;
        if (stoppedAt && at >= stoppedAt) volume = 0;
        if (n.status === "DISCONNECTED" && qualityChangedAt && at >= qualityChangedAt) volume = 0;

        const sent = rng.roundStochastic(volume);
        const degraded = qualityChangedAt !== null && at >= qualityChangedAt;
        const deliveryRate = degraded ? (n.deliveryRate ?? DEFAULT_DELIVERY) : DEFAULT_DELIVERY;
        const delivered = Math.min(sent, rng.roundStochastic(sent * deliveryRate * rng.between(0.99, 1.01)));
        const hoursAgo = (now.getTime() - t) / HOUR_MS;
        const readLag = hoursAgo <= 2 ? 0.6 : 1; // as últimas horas ainda não foram lidas
        const read = Math.min(delivered, rng.roundStochastic(delivered * spec.readRate * readLag * rng.between(0.95, 1.04)));
        const optOutRate = spec.optOutRateLast24h != null && hoursAgo <= 24 ? spec.optOutRateLast24h : spec.optOutRate;

        hourly.push({
          hour: iso(at),
          tenantId,
          businessManagerId: number.businessManagerId,
          phoneNumberId: number.id,
          sent,
          delivered,
          read,
          failed: sent - delivered,
          inbound: rng.roundStochastic(read * 0.07),
          optOuts: rng.roundStochastic(delivered * optOutRate),
        });
      }
    }
  }

  return {
    now,
    plans,
    tenants,
    businessManagers,
    wabas,
    phoneNumbers,
    templates,
    campaigns,
    consentCounts,
    hourly,
    daily: rollupDaily(hourly, templates),
    services: buildServices(now),
  };
}

function buildCampaign(
  spec: TenantSpec,
  c: TenantSpec["campaigns"][number],
  k: number,
  target: { number: PhoneNumber; spec: NumberSpec },
  now: Date,
  rng: ReturnType<typeof createRng>,
): Campaign {
  const suppressedOptOut = Math.round(c.targeted * spec.optedOutPct);
  const suppressedNoConsent = Math.round(c.targeted * 0.012);
  const eligible = c.targeted - suppressedOptOut - suppressedNoConsent;
  const progress =
    c.status === "completed" ? 1 : c.status === "running" ? rng.between(0.45, 0.9) : c.status === "paused" ? 0.36 : c.status === "canceled" ? 0.22 : 0;
  const sent = Math.round(eligible * progress);
  const delivered = Math.round(sent * (target.spec.deliveryRate ?? DEFAULT_DELIVERY));
  const read = Math.round(delivered * spec.readRate);
  const stats: CampaignStats = {
    targeted: c.targeted,
    suppressedOptOut,
    suppressedNoConsent,
    queued: c.status === "running" ? eligible - sent : 0,
    sent,
    delivered,
    read,
    failed: sent - delivered,
    replied: Math.round(read * 0.05),
    optOuts: Math.round(delivered * (spec.optOutRateLast24h ?? spec.optOutRate)),
  };
  const isFuture = c.status === "scheduled";
  const startedAt = isFuture || c.status === "draft" ? null : new Date(now.getTime() - c.hours * HOUR_MS);
  const finishedAt =
    c.status === "completed" || c.status === "canceled" ? new Date((startedAt ?? now).getTime() + 7 * HOUR_MS) : null;

  return {
    id: asId(`cmp_${spec.slug}_${k + 1}`),
    tenantId: target.number.tenantId,
    name: c.name,
    templateId: asId(`tpl_${spec.slug}_${c.template}`),
    phoneNumberId: target.number.id,
    audience: { listIds: [asId(`lst_${spec.slug}_base`)], includeTags: [], excludeTags: ["cliente-inativo"] },
    variableMapping: { "1": "name" },
    status: c.status,
    pauseReason: c.pauseReason ?? null,
    scheduledAt: isFuture ? iso(new Date(now.getTime() + c.hours * HOUR_MS)) : startedAt ? iso(startedAt) : null,
    startedAt: startedAt ? iso(startedAt) : null,
    finishedAt: finishedAt ? iso(finishedAt) : null,
    throttle: { maxPerMinute: 1_200, sendWindow: { start: "08:00", end: "21:00" } },
    guardrails: { maxOptOutRate: 0.015, pauseOnQualityDrop: true },
    stats,
    createdBy: asId(`usr_${spec.slug}_owner`),
    createdAt: iso(new Date((startedAt ?? now).getTime() - 2 * DAY_MS)),
    updatedAt: iso(new Date(now.getTime() - 10 * 60_000)),
  };
}

function rollupDaily(hourly: HourlyNumberStats[], templates: MessageTemplate[]): DailyNumberStats[] {
  const marketingShare = new Map<string, number>();
  for (const t of templates) {
    const prev = marketingShare.get(t.tenantId) ?? 0;
    if (t.category === "MARKETING" && t.status !== "REJECTED") marketingShare.set(t.tenantId, Math.min(0.7, prev + 0.35));
    else if (!marketingShare.has(t.tenantId)) marketingShare.set(t.tenantId, 0);
  }

  const byKey = new Map<string, DailyNumberStats>();
  for (const h of hourly) {
    const date = localDate(new Date(h.hour));
    const key = `${h.phoneNumberId}|${date}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        date,
        tenantId: h.tenantId,
        businessManagerId: h.businessManagerId,
        phoneNumberId: h.phoneNumberId,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        inbound: 0,
        optOuts: 0,
        businessInitiatedRecipients: 0,
        billableByCategory: { marketing: 0, utility: 0, authentication: 0, authentication_international: 0, service: 0 },
        estimatedCostMicros: 0,
      };
      byKey.set(key, row);
    }
    row.sent += h.sent;
    row.delivered += h.delivered;
    row.read += h.read;
    row.failed += h.failed;
    row.inbound += h.inbound;
    row.optOuts += h.optOuts;
  }

  for (const row of byKey.values()) {
    const mk = marketingShare.get(row.tenantId) ?? 0;
    row.businessInitiatedRecipients = Math.round(row.sent * 0.9);
    row.billableByCategory.marketing = Math.round(row.delivered * mk);
    row.billableByCategory.utility = row.delivered - row.billableByCategory.marketing;
    row.estimatedCostMicros =
      row.billableByCategory.marketing * MOCK_PRICE_MICROS.marketing + row.billableByCategory.utility * MOCK_PRICE_MICROS.utility;
  }
  return [...byKey.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function buildServices(now: Date): ServiceHealth[] {
  const checkedAt = iso(new Date(now.getTime() - 30_000));
  return [
    { key: "api", name: "API do produto", status: "operational", primary: { label: "p95", value: 142, unit: "ms" }, detail: null, checkedAt },
    { key: "dispatch_queue", name: "Fila de disparo", status: "operational", primary: { label: "na fila", value: 38_410, unit: "msg" }, detail: null, checkedAt },
    { key: "dispatch_workers", name: "Workers de envio", status: "operational", primary: { label: "vazão", value: 61, unit: "msg/s" }, detail: null, checkedAt },
    {
      key: "meta_webhooks",
      name: "Webhooks da Meta",
      status: "degraded",
      primary: { label: "atraso", value: 41, unit: "s" },
      detail: "Status de entrega chegando com 41 s de atraso. Relatórios das últimas horas podem estar incompletos.",
      checkedAt,
    },
    { key: "database", name: "Banco de dados", status: "operational", primary: { label: "p95", value: 9, unit: "ms" }, detail: null, checkedAt },
    { key: "token_refresh", name: "Renovação de tokens", status: "operational", primary: { label: "BMs", value: 17, unit: "count" }, detail: null, checkedAt },
    { key: "scheduler", name: "Agendador", status: "operational", primary: { label: "agendadas", value: 6, unit: "count" }, detail: null, checkedAt },
  ];
}
