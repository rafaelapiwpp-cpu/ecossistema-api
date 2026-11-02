import { getStatus, type Intent, type StatusDef, type StatusDomain, type StatusIcon } from "@eco/tokens/status-map";
import { Glyph } from "./glyph";
import { cx } from "./cx";

type BadgeLook = { size?: "sm" | "md"; className?: string; title?: string };

export type StatusBadgeProps = BadgeLook &
  (
    | { domain: StatusDomain; value: string; intent?: never; label?: never; icon?: never }
    | { intent: Intent; label: string; icon?: StatusIcon; domain?: never; value?: never }
  );

/**
 * Pílula de estado. Rótulo, cor e ícone vêm do status-map — passe `domain` + `value`
 * (ex.: domain="phoneNumber" value="RESTRICTED"). `intent` + `label` só para estados
 * fora do mapa (e peça o valor novo ao chat UX & Design System).
 */
export function StatusBadge(props: StatusBadgeProps) {
  const def: StatusDef =
    props.domain !== undefined ? getStatus(props.domain, props.value) : { label: props.label, intent: props.intent, icon: props.icon };
  return (
    <span
      className={cx(
        "eco-badge",
        def.intent !== "neutral" && `eco-badge--${def.intent}`,
        def.icon && "eco-badge--icon",
        props.size === "sm" && "eco-badge--sm",
        props.className,
      )}
      title={props.title}
    >
      {def.icon && <Glyph name={def.icon} />}
      {def.label}
    </span>
  );
}

/** Etiqueta sem juízo de valor: plano (`brand`) ou identificador técnico (`tag`, em mono). */
export function Tag({ variant = "tag", children }: { variant?: "brand" | "tag"; children: React.ReactNode }) {
  return <span className={cx("eco-badge", `eco-badge--${variant}`)}>{children}</span>;
}

export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

/** Recibo de mensagem com rótulo, para listas e tabelas (sem moldura). */
export function Receipt({ status }: { status: MessageStatus }) {
  const def = getStatus("message", status);
  return (
    <span className={cx("eco-receipt", status === "delivered" && "eco-receipt--delivered", status === "read" && "eco-receipt--read", status === "failed" && "eco-receipt--failed")}>
      {def.icon && <Glyph name={def.icon} width={16} height={16} />}
      {def.label}
    </span>
  );
}

/** Tique só com ícone, dentro do balão: ✓ enviada · ✓✓ entregue · ✓✓ azul lida · ⚠ falhou. */
export function Tick({ status }: { status: MessageStatus }) {
  const def = getStatus("message", status);
  return (
    <span className={cx("eco-tick", `eco-tick--${status}`)} title={def.label}>
      <Glyph name={def.icon ?? "check"} />
      <span className="eco-sr">{def.label}</span>
    </span>
  );
}

/** Aviso inline. `serious` fica entre warning e danger. */
export function Callout({
  intent = "info",
  title,
  children,
  action,
  className,
}: {
  intent?: Exclude<Intent, "neutral"> | "neutral";
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const icon = intent === "success" ? "check" : intent === "info" || intent === "neutral" ? "info" : "alert";
  return (
    <div className={cx("eco-callout", intent !== "neutral" && `eco-callout--${intent}`, className)} role={intent === "danger" || intent === "serious" ? "alert" : "status"}>
      <Glyph name={icon} />
      <div className="eco-callout__body">
        {title && <span className="eco-callout__title">{title}</span>}
        {children && <span className="eco-callout__text">{children}</span>}
      </div>
      {action && <div className="eco-callout__action">{action}</div>}
    </div>
  );
}

/**
 * Barra de uso de limite ou cota. Marca até 80%; a partir daí warning, 95% serious, 100% danger.
 * Sempre acompanhada do número ("1.640 / 2.000") — a barra não carrega o valor sozinha.
 */
export function Meter({ value, max, label, className }: { value: number; max: number; label?: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tone = pct >= 100 ? "danger" : pct >= 95 ? "serious" : pct >= 80 ? "warning" : undefined;
  return (
    <span
      className={cx("eco-meter", tone && `eco-meter--${tone}`, className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}
