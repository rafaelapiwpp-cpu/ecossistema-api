/**
 * Imprime o read model da visão geral a partir do mock.
 * Útil para conferir números sem abrir o navegador:  npm run mock:overview
 */
import { createMockDataSource, getAdminOverview } from "../src";

const overview = await getAdminOverview(createMockDataSource());
const { kpis, attention, alerts } = overview;

console.log("Gerado em", overview.generatedAt, `(fonte: ${overview.dataSource})`);
console.log("Precisam de atenção:", attention.tenants.map((t) => t.name).join(", ") || "ninguém");
console.log("Infra:", attention.worstInfraStatus, attention.infraIssues);
console.table({
  clientes: kpis.tenants,
  bms: kpis.businessManagers,
  numeros: kpis.phoneNumbers,
});
console.table(kpis.messages24h);
console.log("Opt-outs 24h:", kpis.optOuts24h);
console.table(alerts.map((a) => ({ severidade: a.severity, tipo: a.kind, cliente: a.tenantName, titulo: a.title })));
console.table(
  overview.tenants.map((t) => ({
    cliente: t.name,
    status: t.status,
    plano: t.planName,
    cota: `${Math.round(t.quotaUsage * 100)}%`,
    optout30d: `${(t.optOutRate30d * 100).toFixed(2)}%`,
    alertas: `${t.alerts.critical}/${t.alerts.serious}/${t.alerts.warning}`,
  })),
);
