import {
  asId,
  MESSAGING_LIMIT_VALUE,
  SEVERITY_RANK,
  effectiveLimits,
  type Alert,
  type AlertKind,
  type AlertSeverity,
  type AlertSubjectType,
  type BusinessManager,
  type Campaign,
  type MessageTemplate,
  type PhoneNumber,
  type Plan,
  type PortfolioLimitUsage,
  type ServiceHealth,
  type Tenant,
  type TenantId,
} from "../domain";
import { DAY_MS } from "../time";

/**
 * Regras que transformam o estado atual em alertas.
 *
 * Funções puras: o mock chama direto; em produção um worker roda as mesmas
 * regras a cada sincronização e grava/resolve linhas na tabela `alerts`
 * (abrindo quando a condição aparece, resolvendo quando some).
 */

export const ALERT_THRESHOLDS = {
  /** Uso do limite de 24 h da BM. */
  bmLimitWarning: 0.8,
  bmLimitSerious: 0.95,
  /** Uso da cota mensal do plano. */
  quotaWarning: 0.9,
  quotaSerious: 1,
  /** Opt-outs / entregues nas últimas 24 h. */
  optOutSpike: 0.015,
  optOutMinDelivered: 500,
  tokenExpiringDays: 7,
  templateRejectedRecentDays: 14,
} as const;

export interface AlertRuleInput {
  now: Date;
  plans: Plan[];
  tenants: Tenant[];
  businessManagers: BusinessManager[];
  phoneNumbers: PhoneNumber[];
  templates: MessageTemplate[];
  campaigns: Campaign[];
  portfolioUsage: PortfolioLimitUsage[];
  /** Mensagens enviadas no mês corrente, por tenant. */
  monthToDateSent: Record<string, number>;
  /** Entregues e opt-outs nas últimas 24 h, por tenant. */
  last24h: Record<string, { delivered: number; optOuts: number }>;
  services: ServiceHealth[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmtPhone = (e164: string) => e164.replace(/^\+55(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");

export function deriveAlerts(input: AlertRuleInput): Alert[] {
  const { now } = input;
  const alerts: Alert[] = [];
  const tenantById = new Map(input.tenants.map((t) => [t.id, t]));
  const planById = new Map(input.plans.map((p) => [p.id, p]));
  const isOperating = (tenantId: TenantId) => {
    const s = tenantById.get(tenantId)?.status;
    return s === "active" || s === "trial" || s === "past_due";
  };

  const push = (
    kind: AlertKind,
    severity: AlertSeverity,
    tenantId: TenantId | null,
    subject: { type: AlertSubjectType; id: string },
    title: string,
    detail: string,
    openedAt: string,
  ) => {
    alerts.push({
      id: asId(`alr_${kind}_${subject.id}`),
      tenantId,
      kind,
      severity,
      title,
      detail,
      subject,
      openedAt,
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
    });
  };

  /* ---------- Números: só a condição mais grave de cada um ---------- */
  for (const n of input.phoneNumbers) {
    if (!isOperating(n.tenantId)) continue;
    const since = n.qualityChangedAt ?? n.updatedAt;
    const who = `${fmtPhone(n.displayPhoneNumber)}${n.label ? ` (${n.label})` : ""}`;
    const subject = { type: "phone_number" as const, id: n.id };

    if (n.status === "BANNED" || n.status === "DISCONNECTED") {
      push("number_disconnected", "serious", n.tenantId, subject, "Número desconectado", `${who} não está enviando. Reconecte na BM ou remova das campanhas.`, since);
    } else if (n.status === "FLAGGED") {
      push("number_flagged", "critical", n.tenantId, subject, "Número sinalizado pela Meta", `${who} está com qualidade baixa e pode ser restringido. Campanhas de marketing neste número foram pausadas.`, since);
    } else if (n.status === "RESTRICTED") {
      push("number_restricted", "critical", n.tenantId, subject, "Número com envio restrito", `${who} está com limite reduzido pela Meta.`, since);
    } else if (n.qualityRating === "RED") {
      push("number_quality_drop", "critical", n.tenantId, subject, "Qualidade baixa", `${who} caiu para qualidade baixa.`, since);
    } else if (n.qualityRating === "YELLOW") {
      push("number_quality_drop", "warning", n.tenantId, subject, "Qualidade média", `${who} caiu para qualidade média. Reveja a frequência e a segmentação.`, since);
    }
  }

  /* ---------- Business Managers ---------- */
  const usageByBm = new Map(input.portfolioUsage.map((u) => [u.businessManagerId, u]));
  for (const bm of input.businessManagers) {
    if (!isOperating(bm.tenantId)) continue;
    const subject = { type: "business_manager" as const, id: bm.id };

    if (bm.connectionStatus === "token_invalid" || bm.connectionStatus === "revoked") {
      push("bm_token_expiring", "critical", bm.tenantId, subject, "Acesso à BM perdido", `O token de ${bm.name} não é mais válido. Nenhum envio sai desta BM até reconectar.`, bm.updatedAt);
    } else if (bm.tokenExpiresAt && new Date(bm.tokenExpiresAt).getTime() - now.getTime() < ALERT_THRESHOLDS.tokenExpiringDays * DAY_MS) {
      const days = Math.max(0, Math.ceil((new Date(bm.tokenExpiresAt).getTime() - now.getTime()) / DAY_MS));
      push("bm_token_expiring", "serious", bm.tenantId, subject, "Token da BM expira em breve", `O acesso a ${bm.name} expira em ${days} ${days === 1 ? "dia" : "dias"}. Peça ao cliente para reautorizar.`, bm.updatedAt);
    }

    if (bm.verificationStatus === "pending" || bm.verificationStatus === "not_verified") {
      push(
        "bm_verification_pending",
        "warning",
        bm.tenantId,
        subject,
        bm.verificationStatus === "pending" ? "Verificação da BM em análise" : "BM sem verificação",
        `${bm.name} está limitada a ${MESSAGING_LIMIT_VALUE[bm.messagingLimitTier] ?? "∞"} destinatários por 24 h até a empresa ser verificada.`,
        bm.createdAt,
      );
    }

    const usage = usageByBm.get(bm.id);
    if (usage?.limit) {
      const ratio = usage.uniqueRecipients / usage.limit;
      if (ratio >= ALERT_THRESHOLDS.bmLimitWarning) {
        push(
          "bm_limit_near",
          ratio >= ALERT_THRESHOLDS.bmLimitSerious ? "serious" : "warning",
          bm.tenantId,
          subject,
          "Limite de 24 h quase no fim",
          `${bm.name} usou ${pct(ratio)} do limite (${usage.uniqueRecipients} de ${usage.limit} destinatários).`,
          usage.windowEnd,
        );
      }
    }
  }

  /* ---------- Templates ---------- */
  for (const t of input.templates) {
    if (!isOperating(t.tenantId)) continue;
    const subject = { type: "template" as const, id: t.id };
    if (t.status === "PAUSED") {
      push("template_paused", "serious", t.tenantId, subject, "Template pausado pela Meta", `"${t.name}" foi pausado por baixa qualidade.`, t.statusChangedAt);
    } else if (t.status === "REJECTED" && now.getTime() - new Date(t.statusChangedAt).getTime() < ALERT_THRESHOLDS.templateRejectedRecentDays * DAY_MS) {
      push("template_rejected", "warning", t.tenantId, subject, "Template rejeitado", `"${t.name}": ${t.rejectionReason ?? "sem motivo informado"}`, t.statusChangedAt);
    }
  }

  /* ---------- Campanhas pausadas automaticamente ---------- */
  for (const c of input.campaigns) {
    if (c.status !== "paused" || !c.pauseReason || c.pauseReason === "manual") continue;
    const reason: Record<string, string> = {
      quality_drop: "o número caiu de qualidade",
      limit_reached: "o limite de 24 h da BM foi atingido",
      opt_out_spike: "a taxa de opt-out passou do teto",
      template_paused: "a Meta pausou o template",
      tenant_suspended: "o cliente foi suspenso",
    };
    push("campaign_auto_paused", "serious", c.tenantId, { type: "campaign", id: c.id }, "Campanha pausada automaticamente", `"${c.name}" parou porque ${reason[c.pauseReason] ?? c.pauseReason}.`, c.updatedAt);
  }

  /* ---------- Tenants: cota, opt-out, cobrança ---------- */
  for (const t of input.tenants) {
    const subject = { type: "tenant" as const, id: t.id };
    const plan = planById.get(t.planId);

    if (t.billingStatus === "overdue") {
      push("billing_overdue", "warning", t.id, subject, "Fatura em atraso", `${t.tradeName} está com a fatura vencida. Envios continuam até o bloqueio.`, t.updatedAt);
    }
    if (!isOperating(t.id) || !plan) continue;

    const quota = effectiveLimits(plan, t).monthlyMessages;
    const used = input.monthToDateSent[t.id] ?? 0;
    if (quota > 0 && used / quota >= ALERT_THRESHOLDS.quotaWarning) {
      push("quota_near_limit", used / quota >= ALERT_THRESHOLDS.quotaSerious ? "serious" : "warning", t.id, subject, "Cota mensal quase no fim", `${t.tradeName} usou ${pct(used / quota)} da cota do mês.`, now.toISOString());
    }

    const day = input.last24h[t.id];
    if (day && day.delivered >= ALERT_THRESHOLDS.optOutMinDelivered && day.optOuts / day.delivered >= ALERT_THRESHOLDS.optOutSpike) {
      push(
        "opt_out_spike",
        "serious",
        t.id,
        subject,
        "Pico de opt-out",
        `${(100 * day.optOuts / day.delivered).toFixed(1).replace(".", ",")}% dos contatos pediram para sair nas últimas 24 h (${day.optOuts} pedidos, todos aplicados).`,
        new Date(now.getTime() - 6 * 3_600_000).toISOString(),
      );
    }
  }

  /* ---------- Infraestrutura ---------- */
  for (const s of input.services) {
    if (s.status === "operational" || s.status === "maintenance") continue;
    push("infra_degraded", s.status === "down" ? "critical" : "serious", null, { type: "service", id: s.key }, `${s.name}: ${s.status === "down" ? "fora do ar" : "degradado"}`, s.detail ?? "", s.checkedAt);
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.openedAt < b.openedAt ? 1 : -1));
}
