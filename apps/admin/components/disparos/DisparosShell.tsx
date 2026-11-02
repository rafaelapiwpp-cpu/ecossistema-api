'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { api, type Bootstrap } from './api';
import { useData } from './hooks';
import { cx } from './format';
import { Icon } from './icons';
import './disparos.css';

const BootCtx = createContext<{ boot: Bootstrap | null; reloadBoot: () => void }>({ boot: null, reloadBoot: () => {} });
export const useBoot = () => useContext(BootCtx);

/**
 * Moldura das telas de disparos, dentro do AppShell do admin. Carrega o catálogo
 * (números, templates, tags) e mostra em que modo o envio está.
 * `full`: tela inteira (editor de fluxo).
 */
export function DisparosShell({ children, full }: { children: ReactNode; full?: boolean }) {
  const { data: boot, reload } = useData(api.bootstrap, [], 4000);
  return (
    <BootCtx.Provider value={{ boot, reloadBoot: reload }}>
      <div className={cx('flex min-h-0 flex-col', full ? 'h-dvh' : 'min-h-dvh')}>
        {boot && <ProviderBar boot={boot} onChange={reload} />}
        <div className={cx('min-h-0 flex-1', !full && 'w-full max-w-[1400px] px-4 py-6 sm:px-8')}>{children}</div>
      </div>
    </BootCtx.Provider>
  );
}

function ProviderBar({ boot, onChange }: { boot: Bootstrap; onChange: () => void }) {
  if (boot.providerKind === 'meta') {
    return (
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-4 text-caption text-fg-secondary sm:px-8">
        <span className="size-1.5 rounded-full bg-success" />Envio pela <b className="font-medium text-fg">Meta Cloud API</b> oficial
      </div>
    );
  }
  const speeds = [1, 10, 60, 300];
  return (
    <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning-border bg-warning-subtle px-4 py-1.5 text-caption sm:px-8">
      <Icon name="info" size={14} className="text-warning" />
      <span className="font-medium text-warning">Simulação</span>
      <span className="text-fg-secondary">Nada é enviado para a Meta. Status e respostas chegam como webhooks simulados, no formato da Cloud API, e ficam salvos no banco.</span>
      {boot.sim && boot.sim.pendingEvents > 0 && <span className="text-fg-muted tabular-nums">{boot.sim.pendingEvents} evento(s) na fila</span>}
      {boot.sim?.speed != null && (
        <div className="ml-auto flex rounded-md bg-canvas/60 p-0.5">
          {speeds.map((s) => (
            <button key={s} type="button" onClick={async () => { await api.simSpeed(s); onChange(); }}
              className={cx('rounded px-1.5 py-0.5 font-medium tabular-nums', boot.sim?.speed === s ? 'bg-warning text-canvas' : 'text-fg-secondary hover:text-fg')}>
              {s}×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
