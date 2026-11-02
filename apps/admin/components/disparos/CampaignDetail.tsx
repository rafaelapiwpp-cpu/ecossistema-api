'use client';
import { useMemo, useState } from 'react';
import { api, type CampaignDetail as Detail } from './api';
import { useData, useDebounced } from './hooks';
import { useNav } from './nav';
import { useBoot } from './DisparosShell';
import { Badge, Banner, Button, Card, Drawer, Empty, Input, Loading, Modal, PageHeader, StackBar, Stat, Tabs } from './kit';
import { Icon } from './icons';
import { NODE_META } from './node-meta';
import { CAMPAIGN_STATUS, MESSAGE_STATUS, RECIPIENT_STATUS, RUN_STATUS, cx, dateTime, num, outcomeLabel, pct, phone as fmtPhone, relative, stepLabel, time } from './format';
import { type FlowGraph, NODE_LABEL, getNode, stepNumbers } from '@/lib/disparos/domain/flow-types';
import { Canvas, type Selection } from './flow-editor/Canvas';

export function CampaignDetail({ id }: { id: string }) {
  const { Link, to } = useNav();
  const { boot } = useBoot();
  const { data, error, reload } = useData(() => api.campaign(id), [id], 2000);
  const [confirm, setConfirm] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);
  const [view, setView] = useState<'funnel' | 'canvas'>('funnel');
  const [phone, setPhone] = useState<string | null>(null);

  if (error) return <div className="text-sm text-danger">{error}</div>;
  if (!data) return <Loading />;
  const { campaign: c, stats: s, flow } = data;
  const st = CAMPAIGN_STATUS[c.status];
  const now = boot?.now ?? Date.now();

  const act = async (a: 'start' | 'pause' | 'resume' | 'cancel') => {
    setActErr(null);
    try { await api.campaignAction(id, a); setConfirm(false); reload(); } catch (e) { setActErr(e instanceof Error ? e.message : String(e)); }
  };

  const remaining = Math.max(0, s.total - s.finished - s.inProgress);
  const eta = c.status === 'running' && s.queued ? Math.ceil(s.queued / c.ratePerMinute) : 0;

  return (
    <>
      <PageHeader
        back={<Link href={to('/campanhas')} className="mb-1 inline-flex items-center gap-1 text-xs text-fg-secondary hover:text-fg"><Icon name="chevronLeft" size={14} />Campanhas</Link>}
        title={<span className="flex items-center gap-3">{c.name}<Badge tone={st.tone} dot={c.status === 'running'}>{st.label}</Badge></span>}
        sub={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={to(`/fluxos/${flow.id}`)} className="inline-flex items-center gap-1 hover:text-fg"><Icon name="flow" size={13} />{flow.name} · v{flow.version}</Link>
            <span className="inline-flex items-center gap-1"><Icon name="phone" size={13} />{data.phone?.displayPhoneNumber}</span>
            <span className="inline-flex items-center gap-1"><Icon name="gauge" size={13} />{c.ratePerMinute}/min</span>
            <span className="inline-flex items-center gap-1"><Icon name="users" size={13} />{c.audience.all ? 'todos os contatos' : c.audience.tags.map((t) => `#${t}`).join(' ')}</span>
          </span>
        }
        actions={<>
          {(c.status === 'draft' || c.status === 'scheduled') && <Button variant="primary" icon="play" onClick={() => act('start')}>Iniciar agora</Button>}
          {(c.status === 'running' || c.status === 'scheduled') && <Button icon="pause" onClick={() => act('pause')}>Pausar</Button>}
          {c.status === 'paused' && <Button variant="primary" icon="play" onClick={() => act('resume')}>Retomar</Button>}
          {!['completed', 'canceled', 'failed'].includes(c.status) && <Button variant="danger" icon="stop" onClick={() => setConfirm(true)}>Cancelar</Button>}
        </>}
      />

      <div className="space-y-4">
        {actErr && <Banner tone="bad">{actErr}</Banner>}
        {c.blockedReason === 'messaging_limit' && (
          <Banner tone="warn" title="Segurando envios: limite diário da Meta atingido">
            O número já falou com {num(data.messagingLimit?.used)} contatos novos nas últimas 24h ({data.messagingLimit?.tier.replace('TIER_', 'limite ')}). Os {num(s.queued)} restantes saem automaticamente quando o limite renovar.
          </Banner>
        )}
        {c.status === 'paused' && <Banner tone="warn" title="Campanha pausada">{c.pauseReason === 'manual' ? 'Pausada manualmente.' : `Motivo: ${c.pauseReason}.`} Ninguém novo recebe a 1ª mensagem; quem já está no fluxo continua (respostas, esperas e opt-out seguem funcionando).</Banner>}
        {c.status === 'scheduled' && <Banner tone="info" icon="calendar" title={`Agendada para ${dateTime(c.scheduledAt)}`}>{relative(c.scheduledAt, now)}. O público foi congelado na criação; quem entrar na blacklist até lá é pulado no envio.</Banner>}

        {/* progresso */}
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Concluído</div>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-semibold tabular-nums text-fg">{s.percentDone.toLocaleString('pt-BR')}%</span>
                <span className="text-sm text-fg-secondary tabular-nums">{num(s.finished)} de {num(s.total)} contatos terminaram o fluxo</span>
              </div>
            </div>
            <div className="text-right text-xs text-fg-secondary">
              {c.startedAt && <div>iniciou {relative(c.startedAt, now)} · {dateTime(c.startedAt)}</div>}
              {c.finishedAt && <div>terminou {dateTime(c.finishedAt)}</div>}
              {eta > 0 && <div className="text-fg">fila esvazia em ≈ {eta < 60 ? `${eta} min` : `${(eta / 60).toFixed(1).replace('.', ',')} h`}</div>}
            </div>
          </div>
          <StackBar className="mt-4" height="h-3" total={s.total} segments={[
            { value: s.finished, className: 'bg-brand', title: 'Concluídos' },
            { value: s.inProgress, className: 'bg-brand/45', title: 'No fluxo agora' },
          ]} />
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-secondary">
            <Legend className="bg-brand" label="Concluídos" value={s.finished} />
            <Legend className="bg-brand/45" label="Em andamento (no fluxo)" value={s.inProgress} />
            <Legend className="bg-raised ring-1 ring-line" label="Aguardando 1º envio" value={remaining} />
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Stat label="Público" icon="users" value={num(s.total)} sub={`${num(s.queued)} na fila`} />
          <Stat label="Enviadas" icon="send" value={num(s.sent)} sub={`${pct(s.sent, s.total - s.skipped)} do público válido`} />
          <Stat label="Entregues" icon="checks" value={num(s.delivered)} sub={`${pct(s.delivered, s.sent)} das enviadas`} tone="ok" />
          <Stat label="Lidas" icon="checks" value={num(s.read)} sub={`${pct(s.read, s.delivered)} das entregues`} tone="info" />
          <Stat label="Em andamento" icon="flow" value={num(s.inProgress)} sub="no fluxo agora" tone={s.inProgress ? 'accent' : undefined} />
          <Stat label="Falhas" icon="alert" value={num(s.failed)} sub="recusadas na entrega" tone={s.failed ? 'bad' : undefined} />
          <Stat label="Blacklist" icon="ban" value={num(s.skippedOptout + s.optedOutDuringFlow)} sub={`${num(s.skippedOptout)} pulados · ${num(s.optedOutDuringFlow)} saíram`} tone={s.optedOutDuringFlow ? 'bad' : undefined} />
        </div>

        {/* por etapa */}
        <Card pad={false}
          title={<span className="flex items-center gap-3">Por etapa<Tabs value={view} onChange={setView} items={[{ value: 'funnel', label: 'Funil' }, { value: 'canvas', label: 'Fluxo ao vivo' }]} /></span>}
          actions={<span className="text-[11px] text-fg-muted">contatos únicos por etapa</span>}>
          {view === 'funnel'
            ? <Funnel data={data} />
            : <div className="h-[460px]"><LiveCanvas graph={flow.graph} live={data.liveByNode} animated={c.status === 'running'} /></div>}
        </Card>

        <Recipients id={id} graph={flow.graph} stats={s} onOpen={setPhone} />
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Cancelar campanha?"
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Voltar</Button><Button variant="danger" icon="stop" onClick={() => act('cancel')}>Cancelar campanha</Button></>}>
        <p className="text-sm text-fg-secondary">Ninguém mais da fila recebe, e as {num(s.inProgress)} execuções em andamento são encerradas (esperas e botões param de responder pelo fluxo). Não dá para desfazer.</p>
      </Modal>

      <ConversationDrawer phone={phone} onClose={() => setPhone(null)} phoneNumberId={c.phoneNumberId} onChanged={reload} />
    </>
  );
}

function Legend({ className, label, value }: { className: string; label: string; value: number }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cx('size-2 rounded-sm', className)} />{label}<b className="tabular-nums text-fg">{num(value)}</b></span>;
}

function Funnel({ data }: { data: Detail }) {
  const graph = data.flow.graph;
  const steps = useMemo(() => stepNumbers(graph), [graph]);
  const max = Math.max(1, ...data.funnel.map((f) => f.reached));
  if (!data.funnel.some((f) => f.reached)) return <Empty icon="flow" title="Ninguém entrou no fluxo ainda">Os números aparecem assim que os primeiros envios saírem.</Empty>;
  return (
    <div className="divide-y divide-line/70">
      {data.funnel.map((f) => {
        const node = getNode(graph, f.nodeId);
        if (!node) return null;
        const meta = NODE_META[node.type];
        const here = data.liveByNode[f.nodeId] ?? 0;
        const outs = Object.entries(f.outcomes).filter(([k]) => !['started', 'resumed', 'waiting'].includes(k)).sort((a, b) => b[1] - a[1]);
        return (
          <div key={f.nodeId} className="grid grid-cols-[minmax(170px,220px)_1fr] items-center gap-4 px-4 py-3 md:grid-cols-[220px_1fr_minmax(0,40%)]">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${meta.color} 16%, transparent)`, color: meta.color }}><Icon name={meta.icon} size={14} /></span>
              <div className="min-w-0 leading-tight">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Etapa {steps.get(node.id)}</div>
                <div className="truncate text-[13px] font-medium text-fg">{NODE_LABEL[node.type]}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(f.reached / max) * 100}%`, background: meta.color }} />
              </div>
              <span className="w-14 text-right text-sm font-semibold tabular-nums text-fg">{num(f.reached)}</span>
            </div>
            <div className="col-span-2 flex flex-wrap gap-1.5 md:col-span-1">
              {here > 0 && <Badge tone="accent" dot>{num(here)} aqui agora</Badge>}
              {outs.map(([k, v]) => { const o = outcomeLabel(node, k); return <Badge key={k} tone={o.tone}>{o.label} <b className="tabular-nums">{num(v)}</b></Badge>; })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LiveCanvas({ graph, live, animated }: { graph: FlowGraph; live: Record<string, number>; animated: boolean }) {
  const steps = useMemo(() => stepNumbers(graph), [graph]);
  const [sel, setSel] = useState<Selection>(null);
  const liveMap = Object.fromEntries(Object.entries(live).map(([k, v]) => [k, { count: v, label: `${v} contato(s) nesta etapa agora` }]));
  return <Canvas graph={graph} steps={steps} selection={sel} onSelect={setSel} readOnly live={liveMap} animated={animated} />;
}

// ---------------------------------------------------------------------------

type RFilter = 'all' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';

function Recipients({ id, graph, stats: s, onOpen }: { id: string; graph: FlowGraph; stats: Detail['stats']; onOpen: (phone: string) => void }) {
  const [filter, setFilter] = useState<RFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search, 250);
  const { data } = useData(() => api.recipients(id, { filter, search: q, page }), [id, filter, q, page], 2500);
  const steps = useMemo(() => stepNumbers(graph), [graph]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card pad={false} title="Destinatários" actions={
      <div className="relative w-56">
        <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
        <Input className="h-8 pl-8 text-xs" placeholder="Nome ou telefone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
    }>
      <div className="border-b border-line px-4 py-2">
        <Tabs<RFilter> value={filter} onChange={(v) => { setFilter(v); setPage(1); }} items={[
          { value: 'all', label: 'Todos', count: s.total },
          { value: 'queued', label: 'Na fila', count: s.queued },
          { value: 'sent', label: 'Só enviadas', count: s.sent - s.delivered },
          { value: 'delivered', label: 'Entregues', count: s.delivered - s.read },
          { value: 'read', label: 'Lidas', count: s.read },
          { value: 'failed', label: 'Falhas', count: s.failed },
          { value: 'skipped', label: 'Pulados', count: s.skipped },
        ]} />
      </div>
      {!data ? <Loading /> : data.rows.length === 0 ? <Empty icon="users" title="Ninguém neste filtro" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-fg-muted">
                <th className="px-4 py-2 font-medium">Contato</th>
                <th className="px-3 py-2 font-medium">1ª mensagem</th>
                <th className="px-3 py-2 font-medium">No fluxo</th>
                <th className="px-3 py-2 font-medium">Etapa atual</th>
                <th className="px-3 py-2 font-medium">Respostas</th>
                <th className="px-4 py-2 text-right font-medium">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const rs = RECIPIENT_STATUS[r.status];
                const run = r.run ? RUN_STATUS[r.run.status] : null;
                const answers = r.run ? Object.entries(r.run.answers) : [];
                return (
                  <tr key={r.id} onClick={() => onOpen(r.phoneE164)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-raised/50">
                    <td className="px-4 py-2.5"><div className="font-medium text-fg">{r.name}</div><div className="text-xs tabular-nums text-fg-muted">{fmtPhone(r.phoneE164)}</div></td>
                    <td className="px-3 py-2.5">
                      <Badge tone={rs.tone}>{rs.label}</Badge>
                      {r.errorTitle && <div className="mt-0.5 max-w-[200px] truncate text-[11px] text-danger" title={r.errorTitle}>{r.errorCode} · {r.errorTitle}</div>}
                    </td>
                    <td className="px-3 py-2.5">{run ? <Badge tone={run.tone} dot={r.run?.status === 'active'}>{run.label}</Badge> : <span className="text-fg-muted">—</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-fg-secondary">
                      {r.run?.currentNodeId ? stepLabel(graph, r.run.currentNodeId, steps) : '—'}
                      {r.run?.wakeAt && ['waiting_delay', 'waiting_reply'].includes(r.run.status) && <div className="text-[11px] text-fg-muted">até {dateTime(r.run.wakeAt)}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {answers.length ? answers.map(([nodeId, key]) => {
                          const o = outcomeLabel(getNode(graph, nodeId), `reply:${key}`);
                          return <Badge key={nodeId} tone={o.tone}>{o.label}</Badge>;
                        }) : <span className="text-fg-muted">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-fg-muted">{dateTime(r.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-fg-secondary">
          <span className="tabular-nums">{num((page - 1) * data.pageSize + 1)}–{num(Math.min(page * data.pageSize, data.total))} de {num(data.total)}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" icon="chevronLeft" disabled={page <= 1} onClick={() => setPage(page - 1)} />
            <span className="px-2 py-1 tabular-nums">{page}/{pages}</span>
            <Button size="sm" variant="ghost" icon="chevronRight" disabled={page >= pages} onClick={() => setPage(page + 1)} />
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function ConversationDrawer({ phone, onClose, phoneNumberId, onChanged }: { phone: string | null; onClose: () => void; phoneNumberId?: string; onChanged?: () => void }) {
  const { boot } = useBoot();
  const { data, reload } = useData(() => (phone ? api.conversation(phone) : Promise.resolve(null)), [phone], 2000);
  const [text, setText] = useState('');
  const mock = boot?.providerKind === 'mock';

  const simulate = async (t: string) => {
    if (!phone || !t.trim()) return;
    await api.simInbound(phone, t.trim(), phoneNumberId);
    setText('');
    reload(); onChanged?.();
  };

  return (
    <Drawer open={!!phone} onClose={onClose} title={<div><div>{data?.name ?? phone}</div><div className="text-xs font-normal tabular-nums text-fg-muted">{fmtPhone(phone)}</div></div>}>
      {!data ? <Loading /> : (
        <div className="flex min-h-full flex-col">
          {data.optOut && (
            <div className="m-4 mb-0"><Banner tone="bad" icon="ban" title="Na blacklist">
              Desde {dateTime(data.optOut.createdAt)} · {data.optOut.reason}. Não recebe nenhum disparo.
            </Banner></div>
          )}
          <div className="flex-1 space-y-2 bg-[#0e0d14] p-4">
            {data.messages.length === 0 && <div className="py-10 text-center text-sm text-fg-muted">Nenhuma mensagem.</div>}
            {[...data.messages].sort((a, b) => a.createdAt - b.createdAt).map((m) => (
              <div key={m.id} className={cx('w-fit max-w-[85%]', m.direction === 'in' && 'ml-auto')}>
                <Bubble text={m.preview} inbound={m.direction === 'in'} />
                <div className={cx('mt-0.5 flex items-center gap-1 text-[10px] text-fg-muted', m.direction === 'in' && 'justify-end')}>
                  {time(m.createdAt)}
                  {m.direction === 'out' && <>
                    <span>·</span>
                    <span className={cx(m.status === 'read' && 'text-info', m.status === 'failed' && 'text-danger')}>{MESSAGE_STATUS[m.status]}</span>
                    {m.status === 'read' || m.status === 'delivered' ? <Icon name="checks" size={12} className={m.status === 'read' ? 'text-info' : ''} /> : null}
                  </>}
                  {m.errorTitle && <span className="text-danger"> · {m.errorCode} {m.errorTitle}</span>}
                </div>
              </div>
            ))}
          </div>
          {mock && (
            <div className="sticky bottom-0 border-t border-line bg-sidebar p-3">
              <div className="mb-1.5 text-[11px] text-warning">Simulador: responder como o contato (vai pelo mesmo webhook da Meta)</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {['Confirmar', 'Remarcar', 'Quero saber', 'SAIR', 'não quero mais receber'].map((t) => (
                  <button key={t} type="button" onClick={() => simulate(t)} className={cx('rounded-md px-2 py-0.5 text-[11px] ring-1 ring-inset', /sair|não quero/i.test(t) ? 'text-danger ring-danger/30' : 'text-fg-secondary ring-line hover:text-fg')}>{t}</button>
                ))}
              </div>
              <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); simulate(text); }}>
                <Input className="h-8 text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem do contato…" />
                <Button size="sm" variant="primary" icon="send" type="submit" aria-label="Enviar" />
              </form>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

/** Mensagem; a última linha "[ A ] [ B ]" (botões interativos) vira botões. */
function Bubble({ text, inbound }: { text: string; inbound: boolean }) {
  const lines = text.split('\n');
  const last = lines[lines.length - 1] ?? '';
  const btns = !inbound && /^(\[ [^\]]+ \] ?)+$/.test(last) ? [...last.matchAll(/\[ ([^\]]+) \]/g)].map((x) => x[1] ?? '') : [];
  const body = btns.length ? lines.slice(0, -1).join('\n') : text;
  return (
    <>
      <div className={cx('whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-snug',
        inbound ? 'rounded-tr-sm bg-[#1f4d3d] text-fg' : 'rounded-tl-sm bg-raised text-fg')}>{body}</div>
      {btns.map((b) => <div key={b} className="mt-1 rounded-lg bg-raised py-1.5 text-center text-[13px] font-medium text-info">{b}</div>)}
    </>
  );
}
