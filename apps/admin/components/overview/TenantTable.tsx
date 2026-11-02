import type { TenantRow } from "@eco/core";
import { Icon } from "@/components/ui/Icon";
import { QualityTag, SEVERITY_ICON, StatusTag, TenantStatusTag } from "@/components/ui/StatusTag";
import { formatCompact, formatInt, formatPercent } from "@/lib/format";
import { SEVERITY_LABEL } from "@/lib/labels";
import p from "./Panel.module.css";
import s from "./TenantTable.module.css";

/** Teto de opt-out (30 d) acima do qual a célula ganha destaque. Mesmo valor do guardrail padrão de campanha. */
const OPT_OUT_HIGHLIGHT = 0.01;

/**
 * Todos os clientes numa tabela densa. Ordem vem do read model:
 * quem tem alerta crítico/sério primeiro, depois por volume do mês.
 */
export function TenantTable({ rows, titleId }: { rows: TenantRow[]; titleId: string }) {
  return (
    <>
      <div className={p.head}>
        <div className={p.headText}>
          <h2 id={titleId} className={p.title}>
            Clientes
          </h2>
          <p className={p.note}>
            {rows.length} {rows.length === 1 ? "cliente" : "clientes"}, ordenados por quem precisa de atenção e depois por volume no mês.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className={s.empty}>Nenhum cliente cadastrado ainda. Os clientes aparecem aqui assim que forem cadastrados e vinculados às BMs.</p>
      ) : (
      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Situação</th>
              <th scope="col">Plano</th>
              <th scope="col" className={s.right}>
                Números
              </th>
              <th scope="col">Pior qualidade</th>
              <th scope="col">Cota do mês</th>
              <th scope="col" className={s.right}>
                Contatos
              </th>
              <th scope="col" className={s.right} title="Opt-outs / entregues nos últimos 30 dias">
                Opt-out 30 d
              </th>
              <th scope="col" className={s.right}>
                Campanhas
              </th>
              <th scope="col">Alertas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} id={`cliente-${r.id}`} className={s.row}>
                <th scope="row">
                  <span className={s.client}>
                    <span className={s.clientName}>{r.name}</span>
                    <span className={s.clientSub}>{r.customDomain ?? `${r.slug}.apihub.app`}</span>
                  </span>
                </th>
                <td>
                  <span className={s.stack}>
                    <TenantStatusTag status={r.status} />
                    {r.billingStatus !== "ok" && (
                      <StatusTag tone={r.billingStatus === "blocked" ? "critical" : "warning"} icon="warning">
                        {r.billingStatus === "blocked" ? "Cobrança bloqueada" : "Fatura vencida"}
                      </StatusTag>
                    )}
                  </span>
                </td>
                <td className={s.muted}>{r.planName}</td>
                <td className={`${s.right} num`}>
                  {r.numbersConnected}
                  <span className={s.of}>/{r.numbersTotal}</span>
                </td>
                <td>{r.numbersTotal > 0 ? <QualityTag quality={r.worstQuality} /> : <span className={s.muted}>—</span>}</td>
                <td>
                  <Quota row={r} />
                </td>
                <td className={`${s.right} num`}>
                  {formatCompact(r.contacts)}
                  <span className={s.sub}>{formatPercent(r.optedOutShare, 1)} saíram</span>
                </td>
                <td className={`${s.right} num ${r.optOutRate30d >= OPT_OUT_HIGHLIGHT ? s.hot : ""}`}>{formatPercent(r.optOutRate30d, 2)}</td>
                <td className={`${s.right} num ${r.campaignsRunning === 0 ? s.muted : ""}`}>{r.campaignsRunning}</td>
                <td>
                  <Alerts row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </>
  );
}

function Quota({ row }: { row: TenantRow }) {
  const level = row.quotaUsage >= 1 ? s.quotaCritical : row.quotaUsage >= 0.9 ? s.quotaWarning : "";
  return (
    <div className={`${s.quota} ${level}`} title={`${formatInt(row.monthToDateSent)} de ${formatInt(row.monthlyQuota)} mensagens no mês`}>
      <span className={s.track} role="meter" aria-valuemin={0} aria-valuemax={row.monthlyQuota} aria-valuenow={row.monthToDateSent} aria-label={`Cota mensal de ${row.name}`}>
        <span className={s.fill} style={{ width: `${Math.max(Math.min(row.quotaUsage, 1) * 100, 2)}%` }} />
      </span>
      <span className={`${s.quotaText} num`}>
        {formatPercent(row.quotaUsage, 0)} <span className={s.of}>de {formatCompact(row.monthlyQuota)}</span>
      </span>
    </div>
  );
}

function Alerts({ row }: { row: TenantRow }) {
  const sevs = (["critical", "serious", "warning"] as const).filter((k) => row.alerts[k] > 0);
  if (sevs.length === 0) return <span className={s.muted}>—</span>;
  return (
    <span className={s.alerts}>
      {sevs.map((k) => (
        <span key={k} className={s[k]} title={`${row.alerts[k]} ${SEVERITY_LABEL[k].toLowerCase()}`}>
          <Icon name={SEVERITY_ICON[k]} size={13} />
          <span className="num">{row.alerts[k]}</span>
        </span>
      ))}
    </span>
  );
}
