'use client';
import type { PointerEvent as RPE, ReactNode } from 'react';
import { type FlowNode, NODE_LABEL, formatDuration } from '@/lib/disparos/domain/flow-types';
import { NODE_META } from '../node-meta';
import { Icon } from '../icons';
import { cx } from '../format';
import { NODE_W } from '@/lib/disparos/domain/graph-ops';

export interface NodeCardProps {
  node: FlowNode;
  step: number | undefined;
  selected: boolean;
  dropTarget: boolean;
  issue: 'error' | 'warning' | null;
  connected: Set<string>;               // handles com conexão
  live?: { count: number; label: string } | null; // contatos nesta etapa (modo acompanhamento)
  onPointerDown: (e: RPE) => void;
  onHandleDown: (handle: string, e: RPE) => void;
}

export function NodeCard({ node, step, selected, dropTarget, issue, connected, live, onPointerDown, onHandleDown }: NodeCardProps) {
  const meta = NODE_META[node.type];
  const isStart = node.type === 'start';

  return (
    <div
      data-node={node.id}
      onPointerDown={onPointerDown}
      className={cx(
        'group absolute select-none rounded-xl border bg-surface text-left shadow-[0_8px_24px_-12px_#000] transition-shadow',
        selected ? 'border-brand ring-2 ring-brand/40' : issue === 'error' ? 'border-danger/60' : issue === 'warning' ? 'border-warning/50' : 'border-line-strong hover:border-line-control',
        dropTarget && 'ring-2 ring-success/60',
        isStart ? 'cursor-grab' : 'cursor-grab',
      )}
      style={{ left: node.position.x, top: node.position.y, width: isStart ? 180 : NODE_W }}
    >
      {/* entrada */}
      {!isStart && (
        <span data-in={node.id}
          className={cx('absolute -left-[7px] top-[19px] size-3 rounded-full border-2 bg-canvas', dropTarget ? 'border-success bg-success' : 'border-line-strong')} />
      )}

      <header className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${meta.color} 18%, transparent)`, color: meta.color }}>
          <Icon name={meta.icon} size={14} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          {!isStart && <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Etapa {step}</div>}
          <div className="truncate text-[13px] font-semibold text-fg">{isStart ? 'Início' : NODE_LABEL[node.type]}</div>
        </div>
        {issue && <Icon name="alert" size={14} className={issue === 'error' ? 'text-danger' : 'text-warning'} />}
        {live && live.count > 0 && (
          <span title={live.label} className="rounded-full bg-brand px-1.5 text-[10px] font-semibold tabular-nums text-on-brand">{live.count}</span>
        )}
      </header>

      <Body node={node} connected={connected} onHandleDown={onHandleDown} />
    </div>
  );
}

function Out({ handle, connected, onHandleDown, children, tone }: { handle: string; connected: Set<string>; onHandleDown: NodeCardProps['onHandleDown']; children: ReactNode; tone?: 'bad' | 'warn' }) {
  const on = connected.has(handle);
  return (
    <div className="relative flex min-h-7 items-center justify-end pr-3 pl-3 text-[11px]">
      {children}
      <span
        data-out={handle}
        onPointerDown={(e) => { e.stopPropagation(); onHandleDown(handle, e); }}
        title="Arraste para ligar à próxima etapa"
        className={cx('absolute -right-[7px] top-1/2 size-3 -translate-y-1/2 cursor-crosshair rounded-full border-2 transition-transform hover:scale-150',
          tone === 'bad' ? 'border-danger' : tone === 'warn' ? 'border-warning' : 'border-brand',
          on ? (tone === 'bad' ? 'bg-danger' : tone === 'warn' ? 'bg-warning' : 'bg-brand') : 'bg-canvas')}
      />
    </div>
  );
}

const clamp = 'line-clamp-3 whitespace-pre-wrap break-words';

function Vars({ text }: { text: string }) {
  const parts = text.split(/(\{\{\s*[\w.]+\s*\}\})/g);
  return <>{parts.map((p, i) => (p.startsWith('{{') ? <span key={i} className="rounded bg-brand-subtle px-0.5 text-brand-text">{p}</span> : p))}</>;
}

function Body({ node, connected, onHandleDown }: { node: FlowNode; connected: Set<string>; onHandleDown: NodeCardProps['onHandleDown'] }) {
  const o = (handle: string, label: ReactNode, tone?: 'bad' | 'warn') => (
    <Out key={handle} handle={handle} connected={connected} onHandleDown={onHandleDown} tone={tone}>{label}</Out>
  );
  const next = o('next', <span className="text-fg-muted">próxima</span>);
  const bubble = 'mx-3 rounded-lg bg-raised px-2.5 py-2 text-[12px] leading-snug text-fg/90';

  switch (node.type) {
    case 'start':
      return <div className="pb-1.5"><div className="px-3 pb-1 text-[11px] text-fg-secondary">Disparo da campanha</div>{next}</div>;

    case 'text':
      return (
        <div className="pb-1.5">
          <div className={cx(bubble, clamp)}>{node.data.text.trim() ? <Vars text={node.data.text} /> : <span className="text-fg-muted">Sem texto</span>}</div>
          {next}
        </div>
      );

    case 'audio':
      return (
        <div className="pb-1.5">
          <div className={cx(bubble, 'flex items-center gap-2')}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--chart-5)_22%,transparent)] text-[var(--chart-5)]"><Icon name="play" size={12} /></span>
            <div className="flex h-5 flex-1 items-center gap-[2px]">
              {Array.from({ length: 22 }, (_, i) => <span key={i} className="w-[2px] rounded-full bg-line-control" style={{ height: `${25 + Math.abs(Math.sin(i * 1.7)) * 75}%` }} />)}
            </div>
            <span className="tabular-nums text-[10px] text-fg-muted">{node.data.durationSeconds ? `0:${String(node.data.durationSeconds).padStart(2, '0')}` : '—'}</span>
          </div>
          <div className="mx-3 mt-1 truncate text-[10px] text-fg-muted">{node.data.voice ? 'Nota de voz · ' : 'Arquivo · '}{node.data.fileName || node.data.mediaUrl || 'nenhum arquivo'}</div>
          {next}
        </div>
      );

    case 'delay':
      return (
        <div className="pb-1.5">
          <div className="mx-3 flex items-center gap-2 rounded-lg bg-raised px-2.5 py-2 text-[12px]">
            <Icon name="clock" size={14} className="text-[var(--chart-4)]" />
            <span className="text-fg-secondary">Aguardar</span>
            <span className="font-semibold tabular-nums text-fg">{formatDuration(node.data.seconds)}</span>
          </div>
          {next}
        </div>
      );

    case 'buttons':
    case 'template': {
      const isTpl = node.type === 'template';
      const text = isTpl ? node.data.bodyPreview : node.data.text;
      return (
        <div className="pb-1.5">
          {isTpl && (
            <div className="mx-3 mb-1.5 flex items-center gap-1.5 text-[10px]">
              <span className="truncate font-mono text-brand-text">{node.data.templateName || 'escolha um modelo'}</span>
              <span className="rounded bg-raised px-1 text-fg-muted">{node.data.category}</span>
            </div>
          )}
          <div className={cx(bubble, clamp)}>{text ? <Vars text={text} /> : <span className="text-fg-muted">Sem texto</span>}</div>
          {(node.type === 'buttons' || node.data.buttons.length > 0) ? (
            <div className="mt-1.5 space-y-px">
              {node.data.buttons.map((b) => o(`btn:${b.key}`,
                <span className={cx('flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1', b.optOut ? 'border-danger/40 text-danger' : 'border-line text-fg')}>
                  <span className="truncate">{b.label}</span>
                  {b.optOut && <span className="flex items-center gap-1 text-[10px]"><Icon name="ban" size={11} />blacklist</span>}
                </span>, b.optOut ? 'bad' : undefined))}
              {o('timeout', <span className="text-fg-muted">sem resposta · {node.data.timeoutSeconds ? formatDuration(node.data.timeoutSeconds) : 'nunca'}</span>, 'warn')}
            </div>
          ) : next}
        </div>
      );
    }

    case 'optout':
      return (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-1.5 rounded-lg bg-danger-subtle px-2.5 py-2 text-[12px] font-medium text-danger">
            <Icon name="ban" size={14} />Entra na blacklist e encerra
          </div>
          {node.data.confirmationText && <div className={cx('mt-1.5 text-[11px] text-fg-secondary', clamp)}>“{node.data.confirmationText}”</div>}
        </div>
      );

    case 'end':
      return <div className="px-3 pb-3 text-[11px] text-fg-secondary">Encerra o fluxo para o contato.</div>;
  }
}
