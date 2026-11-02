import type { AdminOverview, HealthStatus } from "@eco/core";
import { Icon, type IconName } from "@/components/ui/Icon";
import { HEALTH_LABEL } from "@/lib/labels";
import s from "./StatusSentence.module.css";

/** Lista em português: "A", "A e B", "A, B e C". */
function joinPt(items: React.ReactNode[]): React.ReactNode[] {
  return items.flatMap((item, i) => {
    if (i === 0) return [item];
    return [i === items.length - 1 ? " e " : ", ", item];
  });
}

const HEALTH_ICON: Record<HealthStatus, IconName> = {
  operational: "operational",
  degraded: "serious",
  down: "critical",
  maintenance: "pause",
};

/**
 * O topo da tela responde, em uma frase, à pergunta do operador:
 * "tem algo pegando fogo?". Os nomes levam à linha do cliente na tabela.
 */
export function StatusSentence({ attention, servicesTotal }: { attention: AdminOverview["attention"]; servicesTotal: number }) {
  const n = attention.tenants.length;
  const names = attention.tenants.map((t) => (
    <a key={t.id} href={`#cliente-${t.id}`} className={s.name}>
      {t.name}
    </a>
  ));

  let headline: React.ReactNode;
  if (n === 0) headline = "Nenhum cliente precisa de atenção agora.";
  else if (n === 1) headline = <>{names[0]} precisa de atenção agora.</>;
  else headline = <>{n} clientes precisam de atenção agora: {joinPt(names)}.</>;

  const issues = attention.infraIssues;
  const okCount = servicesTotal - issues.length;
  const worst = attention.worstInfraStatus;

  let infraText: string;
  if (issues.length === 0) {
    infraText =
      servicesTotal === 1 ? "Infraestrutura normal no serviço monitorado." : `Infraestrutura normal nos ${servicesTotal} serviços.`;
  } else {
    const list = issues.map((i) => `${i.name} (${HEALTH_LABEL[i.status].toLowerCase()})`).join(", ");
    const rest = okCount === 0 ? "" : okCount === 1 ? " O outro serviço está normal." : ` Os outros ${okCount} estão normais.`;
    infraText = `${issues.length === 1 ? "Serviço com problema" : "Serviços com problema"}: ${list}.${rest}`;
  }

  return (
    <div className={s.wrap}>
      <p className={s.headline}>{headline}</p>
      <p className={s.infra} data-status={worst}>
        <Icon name={HEALTH_ICON[worst]} size={16} className={s.infraIcon} />
        <span>{infraText}</span>
      </p>
    </div>
  );
}
