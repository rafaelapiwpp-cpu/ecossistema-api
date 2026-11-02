import type { AdminOverview } from "@eco/core";
import { Icon } from "@/components/ui/Icon";
import { formatCompact, formatDelta, formatInt, formatPercent } from "@/lib/format";
import s from "./StatusRibbon.module.css";

/** "de 12; 1 em trial, 2 suspensos" — omite contagens zeradas. */
function withDetails(base: string, parts: Array<[number, string, string]>): string {
  const extras = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  return extras.length ? `${base}; ${extras.join(", ")}` : base;
}

/**
 * Faixa única de indicadores — uma régua, não seis cartões.
 * Cada célula: o que é, o número, e o contexto que muda a leitura do número.
 */
export function StatusRibbon({ kpis }: { kpis: AdminOverview["kpis"] }) {
  const m = kpis.messages24h;
  const delta = formatDelta(m.sent, m.sentPrevious24h);
  const down = m.sent < m.sentPrevious24h;

  return (
    <section aria-label="Indicadores gerais" className={s.ribbon}>
      <dl className={s.cells}>
        <div className={s.cell}>
          <dt>Clientes ativos</dt>
          <dd className={`${s.value} num`}>{kpis.tenants.active}</dd>
          <dd className={s.context}>{withDetails(`de ${kpis.tenants.total}`, [
            [kpis.tenants.trial, "em trial", "em trial"],
            [kpis.tenants.pastDue, "inadimplente", "inadimplentes"],
            [kpis.tenants.suspended, "suspenso", "suspensos"],
          ])}</dd>
        </div>

        <div className={s.cell}>
          <dt>BMs verificadas</dt>
          <dd className={`${s.value} num`}>{kpis.businessManagers.verified}</dd>
          <dd className={s.context}>{withDetails(`de ${kpis.businessManagers.total}`, [
            [kpis.businessManagers.awaitingVerification, "aguardando verificação", "aguardando verificação"],
          ])}</dd>
        </div>

        <div className={s.cell}>
          <dt>Números conectados</dt>
          <dd className={`${s.value} num`}>{kpis.phoneNumbers.connected}</dd>
          <dd className={s.context}>
            de {kpis.phoneNumbers.total};{" "}
            {kpis.phoneNumbers.lowQuality > 0 ? (
              <span className={s.critical}>
                <Icon name="critical" size={13} /> {kpis.phoneNumbers.lowQuality} com qualidade baixa
              </span>
            ) : (
              "nenhum com qualidade baixa"
            )}
          </dd>
        </div>

        <div className={s.cell}>
          <dt>Enviadas em 24 h</dt>
          <dd className={`${s.value} num`} title={`${formatInt(m.sent)} mensagens`}>
            {formatCompact(m.sent)}
          </dd>
          <dd className={s.context}>
            {delta && (
              <span className={s.delta}>
                {delta !== "estável" && <Icon name={down ? "arrowDown" : "arrowUp"} size={13} />}
                {delta}
              </span>
            )}{" "}
            vs. as 24 h anteriores
          </dd>
        </div>

        <div className={s.cell}>
          <dt>Taxa de entrega</dt>
          <dd className={`${s.value} num`}>{m.sent === 0 ? "—" : formatPercent(m.deliveryRate)}</dd>
          <dd className={s.context}>
            {m.sent === 0 ? (
              "sem envios registrados nas últimas 24 h"
            ) : (
              <>
            <span className={s.read}>
              <Icon name="doubleCheck" size={14} />
              {formatPercent(m.readRate, 0)}
            </span>{" "}
            das entregues foram lidas
              </>
            )}
          </dd>
        </div>

        <div className={s.cell}>
          <dt>Opt-outs em 24 h</dt>
          <dd className={`${s.value} num`}>{formatInt(kpis.optOuts24h.count)}</dd>
          <dd className={s.context}>
            {m.delivered === 0 ? "nenhum envio entregue nas últimas 24 h" : `${formatPercent(kpis.optOuts24h.rate, 2)} das entregues; todos aplicados`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
