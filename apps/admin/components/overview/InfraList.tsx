import type { HealthSignal, ServiceHealth } from "@eco/core";
import { HealthTag } from "@/components/ui/StatusTag";
import { formatAgo, formatInt } from "@/lib/format";
import p from "./Panel.module.css";
import s from "./InfraList.module.css";

function formatSignal(sig: HealthSignal): string {
  const v = formatInt(sig.value);
  switch (sig.unit) {
    case "ms":
      return `${sig.label} ${v} ms`;
    case "s":
      return `${sig.label} ${v} s`;
    case "msg":
      return `${v} ${sig.label}`;
    case "msg/s":
      return `${v} msg/s`;
    case "%":
      return `${sig.label} ${v}%`;
    case "count":
      return `${v} ${sig.label}`;
  }
}

export function InfraList({ services, now, titleId }: { services: ServiceHealth[]; now: Date; titleId: string }) {
  const checked = services.reduce((latest, x) => (x.checkedAt > latest ? x.checkedAt : latest), services[0]?.checkedAt ?? now.toISOString());

  return (
    <div className={s.wrap}>
      <div className={p.head}>
        <div className={p.headText}>
          <h2 id={titleId} className={p.title}>
            Infraestrutura
          </h2>
          <p className={p.note}>Verificado {formatAgo(checked, now)}.</p>
        </div>
      </div>
      <ul className={s.list}>
        {services.map((svc) => (
          <li key={svc.key} className={`${s.item} ${svc.status !== "operational" ? s.issue : ""}`}>
            <div className={s.row}>
              <span className={s.name}>{svc.name}</span>
              <span className={`${s.signal} num`}>{formatSignal(svc.primary)}</span>
              <span className={s.status}>
                <HealthTag status={svc.status} />
              </span>
            </div>
            {svc.detail && <p className={s.detail}>{svc.detail}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
