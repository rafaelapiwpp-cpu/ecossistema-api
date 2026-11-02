'use client';
/**
 * Primitivos visuais do módulo. Quando o Design System global existir,
 * troque a implementação aqui e as telas acompanham.
 */
import { useEffect, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react';
import { cx, type Tone } from './format';
import { Icon, type IconName } from './icons';

const TONE: Record<Tone, string> = {
  neutral: 'bg-raised text-fg-secondary ring-line',
  accent: 'bg-brand-subtle text-brand-text ring-brand/30',
  ok: 'bg-success-subtle text-success ring-success/25',
  warn: 'bg-warning-subtle text-warning ring-warning/25',
  bad: 'bg-danger-subtle text-danger ring-danger/25',
  info: 'bg-info-subtle text-info ring-info/25',
};

export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', TONE[tone], className)}>
      {dot && <span className="pulse-dot size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size = 'md', icon, children, className, ...rest }:
  { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: IconName } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-brand text-on-brand hover:bg-brand-hover shadow-[0_0_0_1px_#a78bfa33_inset]',
    secondary: 'bg-raised text-fg ring-1 ring-inset ring-line hover:bg-overlay',
    ghost: 'text-fg-secondary hover:text-fg hover:bg-raised',
    danger: 'bg-danger-subtle text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger/20',
  };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-brand',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        v[variant], className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export function Card({ children, className, title, actions, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx('rounded-lg border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2">
          <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: IconName }) {
  const color: Partial<Record<Tone, string>> = { ok: 'text-success', warn: 'text-warning', bad: 'text-danger', info: 'text-info', accent: 'text-brand-text' };
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
        {icon && <Icon name={icon} size={13} />}{label}
      </div>
      <div className={cx('mt-1 truncate text-2xl font-semibold tabular-nums', tone ? color[tone] : 'text-fg')}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-fg-secondary">{sub}</div>}
    </div>
  );
}

/** Barra empilhada. Segmentos em ordem; o resto fica vazio. */
export function StackBar({ total, segments, className, height = 'h-2' }:
  { total: number; segments: { value: number; className: string; title?: string }[]; className?: string; height?: string }) {
  return (
    <div className={cx('flex w-full overflow-hidden rounded-full bg-raised', height, className)}>
      {segments.map((s, i) => (
        <div key={i} title={s.title} className={cx('h-full transition-[width] duration-700 ease-out', s.className)}
          style={{ width: total ? `${(s.value / total) * 100}%` : '0%' }} />
      ))}
    </div>
  );
}

export function PageHeader({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {sub && <div className="mt-1 text-sm text-fg-secondary">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const field = 'w-full rounded-md border border-line-control bg-field px-3 text-sm text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50';
export const Input = ({ className, ...p }: ComponentProps<'input'>) => <input className={cx(field, 'h-9', className)} {...p} />;
export const Textarea = ({ className, ...p }: ComponentProps<'textarea'>) => <textarea className={cx(field, 'py-2 leading-relaxed', className)} {...p} />;
export const Select = ({ className, children, ...p }: ComponentProps<'select'>) => (
  <select className={cx(field, 'h-9 appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8', className)}
    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236f6b85' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")` }} {...p}>
    {children}
  </select>
);

export function Field({ label, hint, error, children, right }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; right?: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg-secondary">{label}</span>
        {right}
      </div>
      {children}
      {error ? <div className="mt-1 text-xs text-danger">{error}</div> : hint ? <div className="mt-1 text-xs text-fg-muted">{hint}</div> : null}
    </label>
  );
}

export function Banner({ tone = 'info', icon, title, children, action }: { tone?: Tone; icon?: IconName; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const map: Record<Tone, string> = {
    neutral: 'border-line bg-raised text-fg-secondary', accent: 'border-brand/30 bg-brand-subtle text-brand-text',
    ok: 'border-success/25 bg-success-subtle text-success', warn: 'border-warning/25 bg-warning-subtle text-warning',
    bad: 'border-danger/25 bg-danger-subtle text-danger', info: 'border-info/25 bg-info-subtle text-info',
  };
  return (
    <div className={cx('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', map[tone])}>
      <Icon name={icon ?? (tone === 'bad' || tone === 'warn' ? 'alert' : 'info')} size={18} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cx('text-fg/80', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }:
  { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className={cx('w-full rounded-2xl border border-line-strong bg-surface shadow-2xl', width)} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button className="rounded-md p-1 text-fg-muted hover:bg-raised hover:text-fg" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = 'max-w-md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onMouseDown={onClose}>
      <aside className={cx('flex h-full w-full flex-col border-l border-line-strong bg-sidebar shadow-2xl', width)} onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="min-w-0 text-[15px] font-semibold">{title}</div>
          <button className="rounded-md p-1 text-fg-muted hover:bg-raised hover:text-fg" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

export function Empty({ icon = 'info', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-xl bg-raised text-fg-muted"><Icon name={icon} size={20} /></div>
      <div className="text-sm font-medium text-fg">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-fg-secondary">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return <div className="flex items-center gap-2 px-4 py-10 text-sm text-fg-muted"><span className="size-2 rounded-full bg-brand pulse-dot" />{label}</div>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => (
        <button key={it.value} type="button" onClick={() => onChange(it.value)}
          className={cx('inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
            value === it.value ? 'bg-brand-subtle text-brand-text ring-1 ring-inset ring-brand/30' : 'text-fg-secondary hover:bg-raised hover:text-fg')}>
          {it.label}
          {it.count != null && <span className="tabular-nums text-fg-muted">{it.count.toLocaleString('pt-BR')}</span>}
        </button>
      ))}
    </div>
  );
}
