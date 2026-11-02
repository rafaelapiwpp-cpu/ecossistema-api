'use client';
import { useState } from 'react';
import { api } from './api';
import { useData } from './hooks';
import { useNav } from './nav';
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader } from './kit';
import { Icon } from './icons';
import { NODE_META } from './node-meta';
import { cx, dateTime } from './format';
import { NODE_LABEL, type NodeType } from '@/lib/disparos/domain/flow-types';

export function FlowsList() {
  const { Link, to, push } = useNav();
  const { data, error } = useData(api.flows, []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<'blank' | 'confirmation'>('confirmation');
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    try {
      const f = await api.createFlow(name, preset);
      push(to(`/fluxos/${f.id}`));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <>
      <PageHeader
        title="Fluxos de automação"
        sub="O roteiro que cada contato percorre depois do disparo: mensagens, esperas, botões e saída para a blacklist."
        actions={<Button variant="primary" icon="plus" onClick={() => { setName(''); setErr(null); setOpen(true); }}>Novo fluxo</Button>}
      />
      {error && <div className="mb-4 text-sm text-danger">{error}</div>}
      {!data ? <Loading /> : data.length === 0 ? (
        <Card><Empty icon="flow" title="Nenhum fluxo ainda" action={<Button variant="primary" icon="plus" onClick={() => setOpen(true)}>Criar o primeiro</Button>}>Crie um fluxo e use-o nas campanhas.</Empty></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((f) => (
            <Link key={f.id} href={to(`/fluxos/${f.id}`)} className="group rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-raised/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-fg group-hover:text-brand-text">{f.name}</div>
                  <div className="mt-0.5 truncate text-xs text-fg-secondary">{f.description || '—'}</div>
                </div>
                <Icon name="chevronRight" className="mt-1 shrink-0 text-fg-muted group-hover:text-fg" />
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {f.publishedVersion ? <Badge tone="ok">v{f.publishedVersion} publicada</Badge> : <Badge>Rascunho</Badge>}
                {f.hasUnpublishedChanges && <Badge tone="warn">alterações pendentes</Badge>}
                {f.errors > 0 && <Badge tone="bad">{f.errors} erro{f.errors > 1 ? 's' : ''}</Badge>}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <div className="flex items-center gap-1">
                  {(f.nodeTypes as NodeType[]).map((t) => (
                    <span key={t} title={NODE_LABEL[t]} className="grid size-6 place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${NODE_META[t].color} 16%, transparent)`, color: NODE_META[t].color }}>
                      <Icon name={NODE_META[t].icon} size={13} />
                    </span>
                  ))}
                  <span className="ml-1.5 text-xs text-fg-secondary">{f.steps} etapa{f.steps === 1 ? '' : 's'}</span>
                </div>
                <span className="text-[11px] text-fg-muted">editado {dateTime(f.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Novo fluxo"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={create} disabled={!name.trim()}>Criar e abrir editor</Button></>}>
        <div className="space-y-4">
          <Field label="Nome" error={err}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Confirmação de consulta" onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['confirmation', 'Partir de um modelo', 'Confirmação com botões Confirmar / Remarcar / Sair, espera e áudio.'],
              ['blank', 'Em branco', 'Só o Início. Monte do zero.'],
            ] as const).map(([v, t, d]) => (
              <button key={v} type="button" onClick={() => setPreset(v)}
                className={cx('rounded-xl border p-3 text-left transition-colors', preset === v ? 'border-brand bg-brand-subtle' : 'border-line hover:border-line-strong')}>
                <div className="text-sm font-medium text-fg">{t}</div>
                <div className="mt-1 text-xs text-fg-secondary">{d}</div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
