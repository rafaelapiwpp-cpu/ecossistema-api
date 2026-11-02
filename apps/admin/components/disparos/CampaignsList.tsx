'use client';
import { useState } from 'react';
import { api, type CampaignListItem } from './api';
import { useData } from './hooks';
import { useNav } from './nav';
import { useBoot } from './DisparosShell';
import { Badge, Banner, Button, Card, Empty, Loading, PageHeader, StackBar, Stat, Tabs } from './kit';
import { Icon } from './icons';
import { CAMPAIGN_STATUS, cx, dateTime, num, pct, relative } from './format';

type Filter = 'all' | 'active' | 'scheduled' | 'done';

export function ProgressCell({ s }: { s: CampaignListItem['stats'] }) {
  return (
    <div className="min-w-[180px]">
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-semibold tabular-nums text-fg">{s.percentDone.toLocaleString('pt-BR')}%</span>
        <span className="tabular-nums text-fg-muted">{num(s.finished)}/{num(s.total)}</span>
      </div>
      <StackBar total={s.total} segments={[
        { value: s.finished, className: 'bg-brand', title: 'Concluídos' },
        { value: s.inProgress, className: 'bg-brand/40', title: 'No fluxo agora' },
      ]} />
    </div>
  );
}

export function CampaignsList() {
  const { Link, to, push } = useNav();
  const { boot } = useBoot();
  const { data, error } = useData(api.campaigns, [], 2000);
  const [filter, setFilter] = useState<Filter>('all');

  if (error) return <div className="text-sm text-danger">{error}</div>;
  if (!data) return <Loading />;

  const now = boot?.now ?? Date.now();
  const active = data.filter((c) => ['running', 'paused'].includes(c.campaign.status));
  const agg = data.reduce((a, c) => ({
    sent: a.sent + c.stats.sent, delivered: a.delivered + c.stats.delivered, read: a.read + c.stats.read,
    inProgress: a.inProgress + c.stats.inProgress, optedOut: a.optedOut + c.stats.optedOutDuringFlow, failed: a.failed + c.stats.failed,
  }), { sent: 0, delivered: 0, read: 0, inProgress: 0, optedOut: 0, failed: 0 });

  const groups: Record<Filter, (c: CampaignListItem) => boolean> = {
    all: () => true,
    active: (c) => ['running', 'paused'].includes(c.campaign.status),
    scheduled: (c) => ['scheduled', 'draft'].includes(c.campaign.status),
    done: (c) => ['completed', 'canceled', 'failed'].includes(c.campaign.status),
  };
  const rows = data.filter(groups[filter]).sort((a, b) => b.campaign.createdAt - a.campaign.createdAt);
  const limited = boot?.phoneNumbers.filter((p) => p.messagingLimit.remaining !== null && p.messagingLimit.remaining < 50) ?? [];

  return (
    <>
      <PageHeader
        title="Campanhas"
        sub="Disparos via WhatsApp API oficial. Quem está na blacklist é excluído automaticamente."
        actions={<Button variant="primary" icon="plus" onClick={() => push(to('/campanhas/nova'))}>Novo disparo</Button>}
      />

      {limited.map((p) => (
        <div key={p.id} className="mb-4">
          <Banner tone="warn" title={`Limite diário da Meta quase no fim em ${p.displayPhoneNumber}`}>
            Restam {num(p.messagingLimit.remaining)} de {num(p.messagingLimit.limit)} contatos novos nas últimas 24h. O excedente fica na fila e sai quando o limite renovar.
          </Banner>
        </div>
      ))}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Em andamento" icon="megaphone" value={num(active.length)} sub={`${num(data.length)} campanhas no total`} tone={active.length ? 'accent' : undefined} />
        <Stat label="Enviadas" icon="send" value={num(agg.sent)} sub="aceitas pela API" />
        <Stat label="Entregues" icon="checks" value={num(agg.delivered)} sub={`${pct(agg.delivered, agg.sent)} das enviadas`} tone="ok" />
        <Stat label="Lidas" icon="checks" value={num(agg.read)} sub={`${pct(agg.read, agg.delivered)} das entregues`} tone="info" />
        <Stat label="No fluxo agora" icon="flow" value={num(agg.inProgress)} sub="aguardando tempo ou resposta" />
        <Stat label="Saíram (opt-out)" icon="ban" value={num(agg.optedOut)} sub="durante os fluxos" tone={agg.optedOut ? 'bad' : undefined} />
      </div>

      <Card pad={false}
        title={<Tabs<Filter> value={filter} onChange={setFilter} items={[
          { value: 'all', label: 'Todas', count: data.length },
          { value: 'active', label: 'Em andamento', count: data.filter(groups.active).length },
          { value: 'scheduled', label: 'Agendadas / rascunho', count: data.filter(groups.scheduled).length },
          { value: 'done', label: 'Encerradas', count: data.filter(groups.done).length },
        ]} />}>
        {rows.length === 0 ? (
          <Empty icon="megaphone" title="Nenhuma campanha aqui" action={<Button variant="primary" icon="plus" onClick={() => push(to('/campanhas/nova'))}>Novo disparo</Button>}>
            Crie um disparo escolhendo o público, o número e o fluxo.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-2.5 font-medium">Campanha</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">% concluído</th>
                  <th className="px-3 py-2.5 text-right font-medium">Enviadas</th>
                  <th className="px-3 py-2.5 text-right font-medium">Entregues</th>
                  <th className="px-3 py-2.5 text-right font-medium">Lidas</th>
                  <th className="px-3 py-2.5 text-right font-medium">No fluxo</th>
                  <th className="px-3 py-2.5 text-right font-medium">Falhas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ campaign: c, stats: s, flowName, phone }) => {
                  const st = CAMPAIGN_STATUS[c.status];
                  return (
                    <tr key={c.id} className="group cursor-pointer border-b border-line/70 last:border-0 hover:bg-raised/50" onClick={() => push(to(`/campanhas/${c.id}`))}>
                      <td className="max-w-[320px] px-4 py-3">
                        <Link href={to(`/campanhas/${c.id}`)} className="block truncate font-medium text-fg group-hover:text-brand-text">{c.name}</Link>
                        <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-fg-muted">
                          <Icon name="flow" size={12} />{flowName}<span className="text-line-strong">•</span><Icon name="phone" size={12} />{phone}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={st.tone} dot={c.status === 'running'}>{st.label}</Badge>
                          {c.blockedReason === 'messaging_limit' && <span className="text-[10px] text-warning">aguardando limite Meta</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3"><ProgressCell s={s} /></td>
                      <td className="px-3 py-3 text-right tabular-nums">{num(s.sent)}<div className="text-[11px] text-fg-muted">{s.queued ? `${num(s.queued)} na fila` : ' '}</div></td>
                      <td className="px-3 py-3 text-right tabular-nums">{num(s.delivered)}<div className="text-[11px] text-fg-muted">{pct(s.delivered, s.sent)}</div></td>
                      <td className="px-3 py-3 text-right tabular-nums">{num(s.read)}<div className="text-[11px] text-fg-muted">{pct(s.read, s.delivered)}</div></td>
                      <td className={cx('px-3 py-3 text-right tabular-nums', s.inProgress ? 'text-brand-text' : 'text-fg-muted')}>{num(s.inProgress)}</td>
                      <td className={cx('px-3 py-3 text-right tabular-nums', s.failed ? 'text-danger' : 'text-fg-muted')}>{num(s.failed)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-fg-secondary">
                        {c.status === 'scheduled' ? <>agendada<div className="text-fg">{dateTime(c.scheduledAt)}</div></>
                          : c.finishedAt ? <>terminou<div className="text-fg">{relative(c.finishedAt, now)}</div></>
                            : c.startedAt ? <>iniciou<div className="text-fg">{relative(c.startedAt, now)}</div></>
                              : <>criada<div className="text-fg">{dateTime(c.createdAt)}</div></>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
