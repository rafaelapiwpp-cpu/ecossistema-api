'use client';
import { useState } from 'react';
import { api, type OptOut } from './api';
import { useData, useDebounced } from './hooks';
import { Badge, Banner, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Stat } from './kit';
import { Icon } from './icons';
import { OPTOUT_SOURCE, dateTime, num, phone as fmtPhone } from './format';
import { ConversationDrawer } from './CampaignDetail';

export function Blacklist({ embedded = false }: { embedded?: boolean }) {
  const [search, setSearch] = useState('');
  const [revoked, setRevoked] = useState(false);
  const q = useDebounced(search, 250);
  const { data, reload } = useData(() => api.blacklist(q, revoked), [q, revoked], 4000);
  const [add, setAdd] = useState(false);
  const [revoke, setRevoke] = useState<OptOut | null>(null);
  const [phone, setPhone] = useState<string | null>(null);

  const active = data?.filter((o) => !o.revokedAt) ?? [];
  const bySource = active.reduce<Record<string, number>>((a, o) => ({ ...a, [o.source]: (a[o.source] ?? 0) + 1 }), {});

  return (
    <>
      {embedded ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm text-fg-secondary">Quem pediu para sair. Nenhuma campanha envia para esses números, em nenhum fluxo ou número.</p>
          <Button variant="primary" icon="plus" onClick={() => setAdd(true)}>Bloquear número</Button>
        </div>
      ) : (
        <PageHeader
          title="Blacklist (opt-out)"
          sub="Quem pediu para sair. Nenhuma campanha envia para esses números, em nenhum fluxo ou número."
          actions={<Button variant="primary" icon="plus" onClick={() => setAdd(true)}>Bloquear número</Button>}
        />
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bloqueados" icon="ban" value={num(active.length)} tone="bad" />
        <Stat label="Por palavra-chave" icon="message" value={num(bySource.keyword ?? 0)} sub="SAIR, PARAR, …" />
        <Stat label="Por botão / etapa" icon="buttons" value={num((bySource.button ?? 0) + (bySource.flow_node ?? 0))} sub="dentro dos fluxos" />
        <Stat label="Pela Meta / manual" icon="shield" value={num((bySource.meta_marketing_optout ?? 0) + (bySource.manual ?? 0) + (bySource.import ?? 0))} sub="131050, recepção, importação" />
      </div>

      <Card pad={false}
        title={
          <div className="relative w-64">
            <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
            <Input className="h-8 pl-8 text-xs" placeholder="Nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        }
        actions={<label className="flex items-center gap-2 text-xs text-fg-secondary"><input type="checkbox" checked={revoked} onChange={(e) => setRevoked(e.target.checked)} className="accent-[var(--brand)]" />mostrar reativados</label>}>
        {!data ? <Loading /> : data.length === 0 ? <Empty icon="ban" title="Ninguém na blacklist">Quando alguém pedir para sair, aparece aqui.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-2 font-medium">Contato</th>
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2 font-medium">Motivo / o que disse</th>
                  <th className="px-3 py-2 font-medium">Desde</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o.id} className="border-b border-line/60 last:border-0 hover:bg-raised/40">
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => setPhone(o.phoneE164)} className="text-left">
                        <div className="font-medium text-fg hover:text-brand-text">{o.contactName ?? 'Sem cadastro'}</div>
                        <div className="text-xs tabular-nums text-fg-muted">{fmtPhone(o.phoneE164)}</div>
                      </button>
                    </td>
                    <td className="px-3 py-2.5"><Badge tone={o.revokedAt ? 'neutral' : 'bad'}>{OPTOUT_SOURCE[o.source]}</Badge></td>
                    <td className="max-w-[320px] px-3 py-2.5 text-xs text-fg-secondary">
                      <div className="truncate">{o.reason ?? '—'}</div>
                      {o.triggerText && <div className="truncate text-fg-muted">“{o.triggerText}”</div>}
                      {o.revokedAt && <div className="truncate text-success">Reativado {dateTime(o.revokedAt)}: {o.revokeReason}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-fg-secondary">{dateTime(o.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {!o.revokedAt && <Button size="sm" variant="ghost" onClick={() => setRevoke(o)}>Registrar pedido para voltar…</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddModal open={add} onClose={() => setAdd(false)} onDone={() => { setAdd(false); reload(); }} />
      <RevokeModal item={revoke} onClose={() => setRevoke(null)} onDone={() => { setRevoke(null); reload(); }} />
      <ConversationDrawer phone={phone} onClose={() => setPhone(null)} />
    </>
  );
}

function AddModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try { await api.addOptOut(phone, reason); setPhone(''); setReason(''); setErr(null); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Adicionar à blacklist"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="danger" icon="ban" onClick={save} disabled={!phone.trim()}>Bloquear número</Button></>}>
      <div className="space-y-4">
        <Field label="Telefone" error={err} hint="DDD + número. Ex.: 51 99999-0000"><Input autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Motivo"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: pediu por telefone" /></Field>
        <p className="text-xs text-fg-secondary">Execuções de fluxo em andamento para esse número são encerradas na hora.</p>
      </div>
    </Modal>
  );
}

function RevokeModal({ item, onClose, onDone }: { item: OptOut | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!item) return;
    try { await api.revokeOptOut(item.id, reason); setReason(''); setErr(null); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <Modal open={!!item} onClose={onClose} title="Contato pediu para voltar a receber"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save} disabled={!reason.trim()}>Reativar</Button></>}>
      <div className="space-y-4">
        <Banner tone="warn" title="Só reative com novo consentimento">
          {item?.contactName ?? item?.phoneE164} pediu para sair. Reative apenas se a pessoa pediu para voltar a receber — o registro fica guardado para auditoria (LGPD).
        </Banner>
        <Field label="Como o contato pediu para voltar?" error={err}>
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: mandou “quero voltar a receber” em 01/11" />
        </Field>
      </div>
    </Modal>
  );
}
