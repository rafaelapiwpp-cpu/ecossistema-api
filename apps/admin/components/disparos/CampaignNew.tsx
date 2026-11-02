'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, type AudiencePreview, type FlowDetail } from './api';
import { useData, useDebounced } from './hooks';
import { useNav } from './nav';
import { useBoot } from './DisparosShell';
import { Badge, Banner, Button, Card, Field, Input, Loading, PageHeader, Select } from './kit';
import { Icon } from './icons';
import { NODE_META } from './node-meta';
import { cx, num } from './format';
import { NODE_LABEL, getNode, nextTarget, renderVars, stepNumbers } from '@/lib/disparos/domain/flow-types';

const QUALITY: Record<'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN', { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  GREEN: { label: 'qualidade alta', tone: 'ok' }, YELLOW: { label: 'qualidade média', tone: 'warn' },
  RED: { label: 'qualidade baixa', tone: 'bad' }, UNKNOWN: { label: 'qualidade —', tone: 'neutral' },
};

export function CampaignNew() {
  const { Link, to, push } = useNav();
  const { boot } = useBoot();
  const { data: flows } = useData(api.flows, []);
  const published = useMemo(() => (flows ?? []).filter((f) => f.publishedVersion), [flows]);

  const [name, setName] = useState('');
  const [phoneId, setPhoneId] = useState('');
  const [flowId, setFlowId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const [rate, setRate] = useState(60);
  const [when, setWhen] = useState<'now' | 'schedule' | 'draft'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [flow, setFlow] = useState<FlowDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!phoneId && boot?.phoneNumbers[0]) setPhoneId(boot.phoneNumbers[0].id); }, [boot, phoneId]);
  useEffect(() => { if (!flowId && published[0]) setFlowId(published[0].id); }, [published, flowId]);
  useEffect(() => { if (flowId) api.flow(flowId).then(setFlow).catch(() => setFlow(null)); }, [flowId]);

  const audience = useDebounced(JSON.stringify({ tags, all, phoneId }), 250);
  useEffect(() => {
    const a = JSON.parse(audience) as { tags: string[]; all: boolean; phoneId: string };
    if (!a.phoneId || (!a.all && !a.tags.length)) { setPreview(null); return; }
    api.audiencePreview(a.phoneId, { tags: a.tags, all: a.all }).then(setPreview).catch(() => setPreview(null));
  }, [audience]);

  if (!boot || !flows) return <Loading />;

  const phone = boot.phoneNumbers.find((p) => p.id === phoneId);
  const limit = preview?.messagingLimit;
  const overLimit = !!(preview && limit?.remaining != null && preview.eligible > limit.remaining);
  const minutes = preview ? Math.ceil(preview.eligible / rate) : 0;

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const c = await api.createCampaign({
        name, phoneNumberId: phoneId, flowId, audience: { tags, all },
        ratePerMinute: rate, startNow: when === 'now',
        scheduledAt: when === 'schedule' && scheduledAt ? new Date(scheduledAt).getTime() : null,
      });
      push(to(`/campanhas/${c.id}`));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  // primeira mensagem (o que o contato recebe)
  const g = flow?.flow.draftGraph;
  const first = g ? getNode(g, nextTarget(g, g.nodes.find((n) => n.type === 'start')?.id ?? '', 'next')) : undefined;
  const sample = { nome: 'Ana', nome_completo: 'Ana Souza', data_consulta: 'ter, 4/11 às 14h', telefone: '' };
  const firstText = first?.type === 'template'
    ? first.data.bodyPreview.replace(/\{\{(\d+)\}\}/g, (_, i) => renderVars(first.data.variables[Number(i) - 1] ?? '', sample))
    : null;
  const steps = g ? stepNumbers(g) : new Map<string, number>();
  const ordered = g ? g.nodes.filter((n) => n.type !== 'start').sort((a, b) => (steps.get(a.id) ?? 0) - (steps.get(b.id) ?? 0)) : [];

  return (
    <>
      <PageHeader
        back={<Link href={to('/campanhas')} className="mb-1 inline-flex items-center gap-1 text-xs text-fg-secondary hover:text-fg"><Icon name="chevronLeft" size={14} />Campanhas</Link>}
        title="Novo disparo"
        sub="Escolha quem recebe, por qual número e qual fluxo cada contato vai percorrer."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card title="1 · Identificação">
            <Field label="Nome da campanha" hint="Só para você — o contato não vê.">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Confirmações da semana 45" />
            </Field>
          </Card>

          <Card title="2 · Público">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {boot.tags.map((t) => {
                  const on = tags.includes(t.tag);
                  return (
                    <button key={t.tag} type="button" disabled={all}
                      onClick={() => setTags(on ? tags.filter((x) => x !== t.tag) : [...tags, t.tag])}
                      className={cx('inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ring-1 ring-inset transition-colors disabled:opacity-40',
                        on ? 'bg-brand-subtle text-brand-text ring-brand/40' : 'text-fg-secondary ring-line hover:text-fg')}>
                      {on && <Icon name="check" size={13} />}#{t.tag}<span className="tabular-nums text-fg-muted">{num(t.count)}</span>
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-[13px] text-fg-secondary">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-[var(--brand)]" />
                Todos os contatos do cliente
              </label>

              {preview && (
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-sidebar p-3 sm:grid-cols-5">
                  <Mini label="Vão receber" value={preview.eligible} tone="text-success" big hint="opt-in registrado" />
                  <Mini label="Sem opt-in" value={preview.noConsent} tone={preview.noConsent ? 'text-warning' : 'text-fg-muted'} hint="não recebem" />
                  <Mini label="Na blacklist" value={preview.optedOut} tone={preview.optedOut ? 'text-danger' : 'text-fg-muted'} hint="excluídos" />
                  <Mini label="Inválidos" value={preview.invalid} tone={preview.invalid ? 'text-warning' : 'text-fg-muted'} hint="sem DDD / fixo" />
                  <Mini label="Duplicados" value={preview.duplicates} tone="text-fg-muted" hint="mesmo número" />
                </div>
              )}
              {preview && preview.noConsent > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-fg-secondary"><Icon name="shield" size={13} className="mt-px shrink-0 text-warning" />
                  {num(preview.noConsent)} contato(s) sem opt-in registrado ficam de fora: só recebe quem consentiu. Registre o consentimento em <Link href="/contatos" className="text-brand-text hover:underline">Contatos e opt-out</Link>.</p>
              )}
              {!boot.tags.length && (
                <Banner tone="info" title="Nenhum contato cadastrado ainda">
                  Importe contatos com opt-in em <Link href="/contatos" className="text-brand-text hover:underline">Contatos e opt-out</Link> e volte aqui.
                </Banner>
              )}
              {preview && preview.optedOut > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-fg-secondary"><Icon name="shield" size={13} className="mt-px shrink-0 text-brand-text" />
                  {num(preview.optedOut)} contato{preview.optedOut > 1 ? 's pediram' : ' pediu'} para sair e não {preview.optedOut > 1 ? 'vão' : 'vai'} receber. Ficam registrados como “pulados” na campanha.</p>
              )}
            </div>
          </Card>

          <Card title="3 · Envio">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Número que envia">
                <Select value={phoneId} onChange={(e) => setPhoneId(e.target.value)}>
                  {boot.phoneNumbers.map((p) => <option key={p.id} value={p.id}>{p.displayPhoneNumber} · {p.verifiedName}</option>)}
                </Select>
              </Field>
              <Field label="Fluxo" right={flowId && <Link href={to(`/fluxos/${flowId}`)} className="text-[11px] text-brand-text hover:underline">abrir editor</Link>}
                hint={!published.length ? 'Nenhum fluxo publicado ainda. Crie e publique em Fluxos.' : published.length < (flows?.length ?? 0) ? 'Só aparecem fluxos publicados.' : undefined}>
                <Select value={flowId} onChange={(e) => setFlowId(e.target.value)}>
                  {published.map((f) => <option key={f.id} value={f.id}>{f.name} · v{f.publishedVersion}</option>)}
                </Select>
              </Field>
            </div>
            {phone && !phone.canSend && (
              <div className="mt-3"><Banner tone="bad" title="Este número não está apto a enviar">
                Status “{phone.status}” ou qualidade baixa. Ajuste em <Link href={`/numeros/${phone.id}`} className="text-brand-text hover:underline">Números</Link>; o disparo não sai por ele até lá.
              </Banner></div>
            )}
            {!boot.phoneNumbers.length && (
              <div className="mt-3"><Banner tone="info" title="Nenhum número cadastrado">Cadastre o número em <Link href="/numeros/novo" className="text-brand-text hover:underline">Números</Link>.</Banner></div>
            )}
            {phone && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
                <Badge tone={QUALITY[phone.qualityRating].tone}>{QUALITY[phone.qualityRating].label}</Badge>
                <Badge>{phone.messagingLimit.tier.replace('TIER_', 'limite ')}</Badge>
                {phone.messagingLimit.remaining != null && <span>restam <b className="text-fg tabular-nums">{num(phone.messagingLimit.remaining)}</b> contatos novos nas últimas 24h</span>}
              </div>
            )}
            {overLimit && (
              <div className="mt-3">
                <Banner tone="warn" title="Público maior que o limite diário da Meta">
                  {num(preview!.eligible)} contatos para {num(limit!.remaining)} disponíveis agora. A campanha envia até o limite, segura o resto na fila e continua sozinha quando a janela de 24h liberar.
                </Banner>
              </div>
            )}

            <div className="mt-5">
              <Field label={`Velocidade: ${rate} mensagens/min`} hint={preview ? `≈ ${minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1).replace('.', ',')} h`} para enviar a primeira mensagem a todos.` : undefined}>
                <input type="range" min={10} max={600} step={10} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full" style={{ accentColor: 'var(--brand)' }} />
              </Field>
            </div>
          </Card>

          <Card title="4 · Quando">
            <div className="grid gap-2 sm:grid-cols-3">
              {([['now', 'Iniciar agora', 'play'], ['schedule', 'Agendar', 'calendar'], ['draft', 'Salvar rascunho', 'save']] as const).map(([v, l, i]) => (
                <button key={v} type="button" onClick={() => setWhen(v)}
                  className={cx('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm', when === v ? 'border-brand bg-brand-subtle text-fg' : 'border-line text-fg-secondary hover:border-line-strong')}>
                  <Icon name={i} size={15} />{l}
                </button>
              ))}
            </div>
            {when === 'schedule' && (
              <div className="mt-3 max-w-xs"><Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
            )}
          </Card>

          {err && <Banner tone="bad">{err}</Banner>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => push(to('/campanhas'))}>Cancelar</Button>
            <Button variant="primary" icon={when === 'now' ? 'send' : when === 'schedule' ? 'calendar' : 'save'} onClick={submit}
              disabled={busy || !name.trim() || !preview?.eligible || !flowId || (when === 'schedule' && !scheduledAt)}>
              {when === 'now' ? `Disparar para ${num(preview?.eligible ?? 0)}` : when === 'schedule' ? 'Agendar disparo' : 'Salvar rascunho'}
            </Button>
          </div>
        </div>

        {/* lateral: o que o contato vai receber */}
        <div className="space-y-5 lg:sticky lg:top-16 lg:self-start">
          <Card title="Primeira mensagem">
            {firstText ? (
              <div className="rounded-xl bg-[#0e0d14] p-3">
                <div className="max-w-[92%] rounded-lg rounded-tl-sm bg-raised px-3 py-2 text-[13px] leading-snug text-fg">{firstText}</div>
                {first?.type === 'template' && first.data.buttons.map((b) => (
                  <div key={b.key} className={cx('mt-1 max-w-[92%] rounded-lg bg-raised py-1.5 text-center text-[13px] font-medium', b.optOut ? 'text-danger' : 'text-info')}>{b.label}</div>
                ))}
                <div className="mt-2 text-[11px] text-fg-muted">Modelo <span className="font-mono">{first?.type === 'template' && first.data.templateName}</span> · exemplo com “Ana”</div>
              </div>
            ) : <p className="text-sm text-fg-muted">Escolha um fluxo.</p>}
          </Card>
          {g && (
            <Card title="Etapas do fluxo" actions={flow?.hasUnpublishedChanges && <Badge tone="warn">rascunho difere da v{flow.publishedVersion}</Badge>}>
              <ol className="space-y-1">
                {ordered.map((n) => (
                  <li key={n.id} className="flex items-center gap-2 text-[13px]">
                    <span className="w-5 text-right text-[11px] tabular-nums text-fg-muted">{steps.get(n.id)}</span>
                    <Icon name={NODE_META[n.type].icon} size={14} style={{ color: NODE_META[n.type].color }} />
                    <span className="text-fg">{NODE_LABEL[n.type]}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Mini({ label, value, tone, hint, big }: { label: string; value: number; tone: string; hint?: string; big?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-fg-muted">{label}</div>
      <div className={cx('font-semibold tabular-nums', big ? 'text-xl' : 'text-lg', tone)}>{num(value)}</div>
      {hint && <div className="text-[10px] text-fg-muted">{hint}</div>}
    </div>
  );
}
