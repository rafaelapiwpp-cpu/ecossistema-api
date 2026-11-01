import type { AlertView } from "@eco/core";
import { Icon } from "@/components/ui/Icon";
import { SEVERITY_ICON } from "@/components/ui/StatusTag";
import { formatAgo } from "@/lib/format";
import { SEVERITY_LABEL } from "@/lib/labels";
import p from "./Panel.module.css";
import s from "./AttentionList.module.css";

const VISIBLE = 9;

export function AttentionList({ alerts, now, titleId }: { alerts: AlertView[]; now: Date; titleId: string }) {
  const counts = { critical: 0, serious: 0, warning: 0 };
  for (const a of alerts) counts[a.severity] += 1;
  const visible = alerts.slice(0, VISIBLE);
  const hidden = alerts.length - visible.length;

  return (
    <div className={s.wrap}>
      <div className={p.head}>
        <div className={p.headText}>
          <h2 id={titleId} className={p.title}>
            Pede atenção
          </h2>
          <p className={s.counts}>
            {(["critical", "serious", "warning"] as const).map((sev) => (
              <span key={sev} className={s[sev]}>
                <Icon name={SEVERITY_ICON[sev]} size={13} />
                <span className="num">{counts[sev]}</span> {SEVERITY_LABEL[sev].toLowerCase()}
                {counts[sev] === 1 ? "" : "s"}
              </span>
            ))}
          </p>
        </div>
      </div>

      {alerts.length === 0 ? (
        <p className={s.empty}>Nada aberto. Novos alertas aparecem aqui assim que uma regra dispara.</p>
      ) : (
        <ol className={s.list}>
          {visible.map((a) => (
            <li key={a.id} className={`${s.item} ${s[a.severity]}`}>
              <Icon name={SEVERITY_ICON[a.severity]} size={16} className={s.icon} label={SEVERITY_LABEL[a.severity]} />
              <div className={s.text}>
                <p className={s.line}>
                  <span className={s.who}>{a.tenantName ?? "Plataforma"}</span>
                  <span className={s.when}>{formatAgo(a.openedAt, now)}</span>
                </p>
                <p className={s.title}>{a.title}</p>
                <p className={s.detail}>{a.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {hidden > 0 && (
        <p className={p.foot}>
          Mais {hidden} {hidden === 1 ? "aviso" : "avisos"} de menor prioridade. A lista completa fica na tela de alertas.
        </p>
      )}
    </div>
  );
}
