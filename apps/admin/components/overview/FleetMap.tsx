"use client";

import { useRef, useState } from "react";
import type { FleetBusinessManager, FleetNumber, FleetTenant } from "@eco/core";
import { Icon, type IconName } from "@/components/ui/Icon";
import { TenantStatusTag } from "@/components/ui/StatusTag";
import { formatCompact, formatInt, formatPercent, formatPhone, lastDigits } from "@/lib/format";
import { NUMBER_STATUS_LABEL, QUALITY_LABEL, TIER_LABEL, VERIFICATION_LABEL } from "@/lib/labels";
import p from "./Panel.module.css";
import s from "./FleetMap.module.css";

const OFFLINE = new Set(["DISCONNECTED", "BANNED", "DELETED"]);

function chipState(n: FleetNumber): { tone: string; icon: IconName | null } {
  if (OFFLINE.has(n.status)) return { tone: s.offline!, icon: "disconnected" };
  const tone = { GREEN: s.green!, YELLOW: s.yellow!, RED: s.red!, UNKNOWN: s.unknown! }[n.quality];
  if (n.status === "FLAGGED") return { tone, icon: "flag" };
  if (n.status === "RESTRICTED") return { tone, icon: "lock" };
  if (n.quality === "RED") return { tone, icon: "critical" };
  if (n.quality === "YELLOW") return { tone, icon: "warning" };
  return { tone, icon: null };
}

function describe(n: FleetNumber): string {
  const parts = [
    formatPhone(n.phone),
    n.label,
    `qualidade ${QUALITY_LABEL[n.quality].toLowerCase()}`,
    NUMBER_STATUS_LABEL[n.status].toLowerCase(),
    !n.sendingEnabled ? "envio bloqueado pelo admin" : null,
    `${formatInt(n.sent24h)} envios em 24 h`,
  ];
  return parts.filter(Boolean).join(", ");
}

interface Tip {
  number: FleetNumber;
  bm: FleetBusinessManager;
  x: number;
  y: number;
}

export function FleetMap({ fleet, titleId }: { fleet: FleetTenant[]; titleId: string }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const show = (el: HTMLElement, number: FleetNumber, bm: FleetBusinessManager) => {
    const body = bodyRef.current;
    if (!body) return;
    const r = el.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    const half = 130;
    const x = Math.min(Math.max(r.left - b.left + r.width / 2, half), b.width - half);
    setTip({ number, bm, x, y: r.top - b.top });
  };
  const hide = () => setTip(null);

  return (
    <>
      <div className={p.head}>
        <div className={p.headText}>
          <h2 id={titleId} className={p.title}>
            Frota de números
          </h2>
          <p className={p.note}>
            Um bloco por número, com os quatro últimos dígitos e a qualidade atribuída pela Meta. A barra mostra quanto do limite de 24 h a BM já usou.
          </p>
        </div>
        <Legend />
      </div>

      {fleet.length === 0 && (
        <p className={s.empty}>
          Nenhum número cadastrado ainda. Cadastre as <a href="/bms">BMs</a> e os <a href="/numeros">números</a> da operação para vê-los aqui com a qualidade e o uso do limite.
        </p>
      )}

      <div className={s.body} ref={bodyRef} onPointerLeave={hide}>
        {fleet.map((t) => (
          <div key={t.tenantId} className={s.tenant}>
            <div className={s.tenantHead}>
              <span className={s.tenantName}>{t.name}</span>
              <span className={s.tenantMeta}>
                {t.planName}
                {t.status !== "active" && <TenantStatusTag status={t.status} />}
              </span>
            </div>

            <ul className={s.bms}>
              {t.businessManagers.map((bm) => (
                <li key={bm.id} className={s.bm}>
                  <div className={s.bmInfo}>
                    <span className={s.bmName} title={bm.name}>
                      {bm.name}
                    </span>
                    {!bm.placeholder && <BmFlags bm={bm} />}
                  </div>

                  {bm.placeholder ? (
                    <div className={s.limit}>
                      <span className={s.limitText}>vincule estes números a uma BM</span>
                    </div>
                  ) : (
                    <LimitUsage bm={bm} />
                  )}

                  <ul className={s.chips} aria-label={`Números da BM ${bm.name}`}>
                    {bm.numbers.map((n) => {
                      const st = chipState(n);
                      return (
                        <li key={n.id}>
                          <span
                            className={`${s.chip} ${st.tone} ${n.sendingEnabled ? "" : s.blocked}`}
                            tabIndex={0}
                            role="img"
                            aria-label={describe(n)}
                            onPointerEnter={(e) => show(e.currentTarget, n, bm)}
                            onFocus={(e) => show(e.currentTarget, n, bm)}
                            onBlur={hide}
                          >
                            {st.icon && <Icon name={st.icon} size={12} />}
                            <span className="num">{lastDigits(n.phone)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {tip && <NumberTooltip tip={tip} />}
      </div>
    </>
  );
}

function BmFlags({ bm }: { bm: FleetBusinessManager }) {
  const flags: Array<{ text: string; tone: string }> = [];
  if (bm.connection === "token_expiring") flags.push({ text: "token expirando", tone: s.flagSerious! });
  if (bm.connection === "token_invalid" || bm.connection === "revoked") flags.push({ text: "acesso perdido", tone: s.flagCritical! });
  if (bm.verification !== "verified") flags.push({ text: VERIFICATION_LABEL[bm.verification].toLowerCase(), tone: s.flagWarning! });
  if (bm.ownership === "platform") flags.push({ text: "operada pela plataforma", tone: s.flagMuted! });
  if (flags.length === 0) return null;
  return (
    <span className={s.flags}>
      {flags.map((f) => (
        <span key={f.text} className={f.tone}>
          {f.text}
        </span>
      ))}
    </span>
  );
}

function LimitUsage({ bm }: { bm: FleetBusinessManager }) {
  if (bm.limit === null || bm.limitUsage === null) {
    return (
      <div className={s.limit} title={`${formatInt(bm.recipients24h)} destinatários nas últimas 24 h, sem limite`}>
        <span className={s.limitTrackUnlimited} aria-hidden="true" />
        <span className={s.limitText}>sem limite</span>
      </div>
    );
  }
  const pct = Math.min(1, bm.limitUsage);
  const level = bm.limitUsage >= 0.95 ? s.limitCritical : bm.limitUsage >= 0.8 ? s.limitWarning : "";
  return (
    <div
      className={`${s.limit} ${level}`}
      title={`${formatInt(bm.recipients24h)} de ${formatInt(bm.limit)} destinatários nas últimas 24 h`}
    >
      <span className={s.limitTrack} role="meter" aria-valuemin={0} aria-valuemax={bm.limit} aria-valuenow={bm.recipients24h} aria-label={`Uso do limite de 24 h da BM ${bm.name}`}>
        <span className={s.limitFill} style={{ width: `${Math.max(pct * 100, 2)}%` }} />
      </span>
      <span className={`${s.limitText} num`}>
        {formatPercent(bm.limitUsage, 0)} de {TIER_LABEL[bm.tier]}
      </span>
    </div>
  );
}

function NumberTooltip({ tip }: { tip: Tip }) {
  const n = tip.number;
  const st = chipState(n);
  return (
    <div className={s.tooltip} style={{ left: tip.x, top: tip.y }} role="tooltip">
      <div className={s.tipHead}>
        <span className="num">{formatPhone(n.phone)}</span>
        {n.label && <span className={s.tipLabel}>{n.label}</span>}
      </div>
      <dl className={s.tipGrid}>
        <dt>Qualidade</dt>
        <dd>
          <span className={`${s.tipSwatch} ${st.tone}`} aria-hidden="true" />
          {QUALITY_LABEL[n.quality]}
        </dd>
        <dt>Situação</dt>
        <dd>
          {NUMBER_STATUS_LABEL[n.status]}
          {!n.sendingEnabled && ", envio bloqueado"}
        </dd>
        <dt>Envios 24 h</dt>
        <dd className="num">{formatCompact(n.sent24h)}</dd>
        <dt>Entrega 24 h</dt>
        <dd className="num">{n.deliveryRate24h === null ? "sem envios" : formatPercent(n.deliveryRate24h)}</dd>
        <dt>Vazão</dt>
        <dd>{n.throughput === "HIGH" ? "Alta, até 1.000 msg/s" : "Padrão, 80 msg/s"}</dd>
        <dt>BM</dt>
        <dd>{tip.bm.name}</dd>
      </dl>
    </div>
  );
}

function Legend() {
  return (
    <ul className={s.legend} aria-label="Legenda">
      <li>
        <span className={`${s.chip} ${s.chipMini} ${s.green}`} aria-hidden="true" />
        Alta
      </li>
      <li>
        <span className={`${s.chip} ${s.chipMini} ${s.yellow}`} aria-hidden="true" />
        Média
      </li>
      <li>
        <span className={`${s.chip} ${s.chipMini} ${s.red}`} aria-hidden="true" />
        Baixa
      </li>
      <li>
        <span className={`${s.chip} ${s.chipMini} ${s.unknown}`} aria-hidden="true" />
        Sem avaliação
      </li>
      <li>
        <span className={`${s.chip} ${s.chipMini} ${s.green} ${s.blocked}`} aria-hidden="true" />
        Envio bloqueado
      </li>
      <li>
        <Icon name="flag" size={13} /> Sinalizado
      </li>
      <li>
        <Icon name="lock" size={13} /> Restrito
      </li>
      <li>
        <Icon name="disconnected" size={13} /> Desconectado
      </li>
    </ul>
  );
}
