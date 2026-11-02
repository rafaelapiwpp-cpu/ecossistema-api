"use client";

import { useEffect, useRef, useState } from "react";
import type { VolumeDay } from "@eco/core";
import { Icon } from "@/components/ui/Icon";
import { dayParts, formatCompact, formatInt, formatPercent } from "@/lib/format";
import p from "./Panel.module.css";
import s from "./VolumeChart.module.css";

/**
 * Volume diário em barras empilhadas, na linguagem dos tiques do WhatsApp:
 * azul = lidas (✓✓ azul), cinza = entregues e ainda não lidas (✓✓ cinza),
 * vermelho = falharam. Lidas ficam na base porque são o resultado que importa.
 */

const HEIGHT = 236;
const M = { top: 14, right: 8, bottom: 36, left: 46 };
const GAP = 2;

function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { top: 1, step: 1 };
  const rough = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= rough) ?? 10) * mag;
  return { top: Math.ceil(max / step) * step, step };
}

export function VolumeChart({ days, titleId }: { days: VolumeDay[]; titleId: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(width - M.left - M.right, 100);
  const plotH = HEIGHT - M.top - M.bottom;
  const { top, step } = niceScale(Math.max(...days.map((d) => d.sent)));
  const y = (v: number) => M.top + plotH - (v / top) * plotH;
  const band = plotW / days.length;
  const barW = Math.min(band * 0.62, 34);
  const everyOther = band < 34;

  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);

  const active = hover !== null ? days[hover] : undefined;
  const totalSent = days.reduce((a, d) => a + d.sent, 0);

  if (totalSent === 0) {
    return (
      <>
        <div className={p.head}>
          <div className={p.headText}>
            <h2 id={titleId} className={p.title}>
              Mensagens nos últimos {days.length} dias
            </h2>
            <p className={p.note}>Nenhuma mensagem registrada no período.</p>
          </div>
        </div>
        <p className={s.empty}>
          O gráfico se preenche quando os disparos começarem a gravar os envios no banco (enviadas, entregues, lidas e falhas por dia).
        </p>
      </>
    );
  }

  return (
    <>
      <div className={p.head}>
        <div className={p.headText}>
          <h2 id={titleId} className={p.title}>
            Mensagens nos últimos {days.length} dias
          </h2>
          <p className={p.note}>
            {formatCompact(totalSent)} enviadas por todos os clientes. Passe o cursor sobre um dia para ver os números.
          </p>
        </div>
        <ul className={s.legend} aria-label="Legenda">
          <li>
            <Icon name="doubleCheck" size={15} className={s.keyRead} />
            Lidas
          </li>
          <li>
            <Icon name="doubleCheck" size={15} className={s.keyDelivered} />
            Entregues, não lidas
          </li>
          <li>
            <Icon name="x" size={14} className={s.keyFailed} />
            Falharam
          </li>
        </ul>
      </div>

      <div className={s.plot} ref={wrapRef} onPointerLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={`Barras de mensagens por dia nos últimos ${days.length} dias. Tabela com os valores logo abaixo.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} className={t === 0 ? s.baseline : s.grid} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className={s.tick}>
                {t === 0 ? "0" : formatCompact(t)}
              </text>
            </g>
          ))}

          {days.map((d, i) => {
            const x = M.left + band * i + (band - barW) / 2;
            const segments = [
              { v: d.read, cls: s.read },
              { v: d.delivered - d.read, cls: s.delivered },
              { v: d.failed, cls: s.failed },
            ].filter((seg) => seg.v > 0);
            let cum = 0;
            const { weekday, day } = dayParts(d.date);
            return (
              <g key={d.date} className={d.isPartial ? s.partial : undefined}>
                {hover === i && <rect x={M.left + band * i} y={M.top} width={band} height={plotH} className={s.hoverBand} />}
                {segments.map((seg, k) => {
                  const yBottom = y(cum) - (k > 0 ? GAP : 0);
                  cum += seg.v;
                  const yTop = y(cum);
                  const h = Math.max(yBottom - yTop, 1);
                  const isTop = k === segments.length - 1;
                  const r = isTop ? Math.min(3, h) : 0;
                  const path = `M${x},${yTop + h} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${yTop + h} Z`;
                  return <path key={seg.cls} d={path} className={seg.cls} />;
                })}
                {(!everyOther || i % 2 === days.length % 2 || i === days.length - 1) && (
                  <text x={M.left + band * i + band / 2} y={M.top + plotH + 16} textAnchor="middle" className={s.xLabel}>
                    <tspan>{d.isPartial ? "hoje" : weekday}</tspan>
                    <tspan x={M.left + band * i + band / 2} dy="13" className={s.xDay}>
                      {day}
                    </tspan>
                  </text>
                )}
                <rect
                  x={M.left + band * i}
                  y={M.top}
                  width={band}
                  height={plotH + M.bottom}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>

        {active && hover !== null && (
          <div
            className={s.tooltip}
            style={{ left: Math.min(Math.max(M.left + band * hover + band / 2, 110), width - 110), top: M.top }}
            role="tooltip"
          >
            <p className={s.tipTitle}>
              {dayParts(active.date).long}
              {active.isPartial && " (parcial)"}
            </p>
            <dl className={s.tipGrid}>
              <dt>Enviadas</dt>
              <dd className="num">{formatInt(active.sent)}</dd>
              <dt>
                <span className={`${s.tipKey} ${s.read}`} />
                Lidas
              </dt>
              <dd className="num">{formatInt(active.read)}</dd>
              <dt>
                <span className={`${s.tipKey} ${s.delivered}`} />
                Entregues, não lidas
              </dt>
              <dd className="num">{formatInt(active.delivered - active.read)}</dd>
              <dt>
                <span className={`${s.tipKey} ${s.failed}`} />
                Falharam
              </dt>
              <dd className="num">{formatInt(active.failed)}</dd>
              <dt>Taxa de entrega</dt>
              <dd className="num">{formatPercent(active.sent ? active.delivered / active.sent : 0)}</dd>
            </dl>
          </div>
        )}
      </div>

      <div className="sr-only">
      <table>
        <caption>Mensagens por dia</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Enviadas</th>
            <th scope="col">Entregues</th>
            <th scope="col">Lidas</th>
            <th scope="col">Falharam</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{dayParts(d.date).long}</th>
              <td>{d.sent}</td>
              <td>{d.delivered}</td>
              <td>{d.read}</td>
              <td>{d.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
