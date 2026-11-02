import type { AdminOverview } from "@eco/core";
import { formatDateTime } from "@/lib/format";
import { AttentionList } from "./AttentionList";
import { FleetMap } from "./FleetMap";
import { InfraList } from "./InfraList";
import { StatusRibbon } from "./StatusRibbon";
import { StatusSentence } from "./StatusSentence";
import { TenantTable } from "./TenantTable";
import { VolumeChart } from "./VolumeChart";
import s from "./OverviewScreen.module.css";

/**
 * Tela "Visão geral" do painel admin. Recebe o read model pronto
 * (getAdminOverview) e só compõe — nenhuma regra de negócio aqui.
 */
export function OverviewScreen({ data }: { data: AdminOverview }) {
  const now = new Date(data.generatedAt);

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.headerBar}>
          <h1 className={s.title}>Visão geral</h1>
          <div className={s.meta}>
            {data.dataSource === "mock" && (
              <span className={s.mockBadge} title="A tela está ligada à camada de dados simulada. Nada aqui reflete clientes reais.">
                Dados simulados
              </span>
            )}
            {data.dataSource === "postgres" && (
              <span className={s.mockBadge} title="Clientes, BMs, números e templates vêm do banco. Métricas de mensagens aparecem quando os disparos gravarem os envios.">
                Dados do banco
              </span>
            )}
            <span className="num">Atualizado em {formatDateTime(data.generatedAt)}</span>
          </div>
        </div>
        <StatusSentence attention={data.attention} servicesTotal={data.infra.length} />
      </header>

      <StatusRibbon kpis={data.kpis} />

      <div className={s.grid}>
        <section className={`${s.panel} ${s.fleet}`} aria-labelledby="frota-titulo">
          <FleetMap fleet={data.fleet} titleId="frota-titulo" />
        </section>

        <section className={`${s.panel} ${s.attention}`} aria-labelledby="atencao-titulo">
          <AttentionList alerts={data.alerts} now={now} titleId="atencao-titulo" />
        </section>

        <section className={`${s.panel} ${s.volume}`} aria-labelledby="volume-titulo">
          <VolumeChart days={data.volume} titleId="volume-titulo" />
        </section>

        <section className={`${s.panel} ${s.infra}`} aria-labelledby="infra-titulo">
          <InfraList services={data.infra} now={now} titleId="infra-titulo" />
        </section>

        <section className={`${s.panel} ${s.tenants}`} aria-labelledby="clientes-titulo">
          <TenantTable rows={data.tenants} titleId="clientes-titulo" />
        </section>
      </div>
    </div>
  );
}
