'use client';
import { useState } from 'react';
import { api, type ImportResult } from './api';
import { useData, useDebounced } from './hooks';
import { useBoot } from './DisparosShell';
import { Badge, Banner, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Stat, Tabs, Textarea } from './kit';
import { Icon } from './icons';
import { CONSENT, CONSENT_SOURCE, dateTime, num, phone as fmtPhone } from './format';
import { Blacklist } from './Blacklist';
import { ConversationDrawer } from './CampaignDetail';

type Tab = 'contatos' | 'blacklist';
type ConsentFilter = '' | 'opted_in' | 'opted_out' | 'unknown';

/** Origens aceitas na importação (mesma lista do service: IMPORT_CONSENT_SOURCES). */
const IMPORT_SOURCES = ['web_form', 'checkout', 'whatsapp_inbound', 'import', 'api', 'admin'] as const;

export function Contacts({ initialTab = 'contatos' }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <>
      <PageHeader
        title="Contatos e opt-out"
        sub="Só recebe disparo quem tem opt-in registrado. Quem pede para sair entra na blacklist e não recebe mais nada."
      />
      <div className="mb-4"><Tabs<Tab> value={tab} onChange={setTab} items={[{ value: 'contatos', label: 'Contatos' }, { value: 'blacklist', label: 'Blacklist' }]} /></div>
      {tab === 'contatos' ? <ContactsTab /> : <Blacklist embedded />}
    </>
  );
}

function ContactsTab() {
  const { boot, reloadBoot } = useBoot();
  const [search, setSearch] = useState('');
  const [consent, setConsent] = useState<ConsentFilter>('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search, 250);
  const { data, reload } = useData(() => api.contacts({ search: q, consent, tag, page }), [q, consent, tag, page], 6000);
  const [importing, setImporting] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [sampleMsg, setSampleMsg] = useState<string | null>(null);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const sim = boot?.providerKind === 'mock';

  const addSamples = async () => {
    try {
      const r = await api.sampleContacts();
      setSampleMsg(`${num(r.created)} contatos de exemplo criados (DDD 00, nunca recebem mensagem real), com a tag #exemplo e #consultas-semana.`);
      reload(); reloadBoot();
    } catch (e) { setSampleMsg(e instanceof Error ? e.message : String(e)); }
  };

  const total = data ? data.counts.opted_in + data.counts.opted_out + data.counts.unknown : 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {sim && <Button icon="users" onClick={addSamples}>Adicionar contatos de exemplo</Button>}
        <Button variant="primary" icon="plus" onClick={() => setImporting(true)}>Importar contatos com opt-in</Button>
      </div>
      {sampleMsg && <div className="mb-4"><Banner tone="info">{sampleMsg}</Banner></div>}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Contatos" icon="users" value={num(total)} />
        <Stat label="Opt-in registrado" icon="check" value={num(data?.counts.opted_in ?? 0)} sub="podem receber" tone="ok" />
        <Stat label="Sem consentimento" icon="info" value={num(data?.counts.unknown ?? 0)} sub="não recebem disparo" />
        <Stat label="Opt-out" icon="ban" value={num(data?.counts.opted_out ?? 0)} sub="na blacklist" tone={data?.counts.opted_out ? 'bad' : undefined} />
      </div>

      <Card pad={false}
        title={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-60">
              <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
              <Input className="h-8 pl-8 text-xs" placeholder="Nome ou telefone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <div className="w-48"><Select className="h-8 text-xs" value={consent} onChange={(e) => { setConsent(e.target.value as ConsentFilter); setPage(1); }} aria-label="Consentimento">
              <option value="">Todo consentimento</option>
              <option value="opted_in">Opt-in registrado</option>
              <option value="unknown">Sem consentimento</option>
              <option value="opted_out">Opt-out</option>
            </Select></div>
            <div className="w-48"><Select className="h-8 text-xs" value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} aria-label="Tag">
              <option value="">Todas as tags</option>
              {boot?.tags.map((t) => <option key={t.tag} value={t.tag}>#{t.tag} ({t.count})</option>)}
            </Select></div>
          </div>
        }>
        {!data ? <Loading /> : data.rows.length === 0 ? (
          <Empty icon="users" title={total ? 'Ninguém neste filtro' : 'Nenhum contato ainda'}
            action={!total ? <Button variant="primary" icon="plus" onClick={() => setImporting(true)}>Importar contatos com opt-in</Button> : undefined}>
            {!total && 'Importe uma lista dizendo de onde veio o consentimento de cada contato.'}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line bg-sidebar text-left text-caption text-fg-muted">
                  <th className="px-4 py-2 font-medium">Contato</th>
                  <th className="px-3 py-2 font-medium">Consentimento</th>
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2 font-medium">Tags</th>
                  <th className="px-4 py-2 text-right font-medium">Desde</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => {
                  const cs = CONSENT[c.consent];
                  return (
                    <tr key={c.id} onClick={() => setPhone(c.phoneE164)} className="cursor-pointer border-b border-line last:border-0 hover:bg-raised">
                      <td className="px-4 py-2.5"><div className="font-medium text-fg">{c.name || 'Sem nome'}</div><div className="font-mono text-xs tabular-nums text-fg-muted">{fmtPhone(c.phoneE164)}</div></td>
                      <td className="px-3 py-2.5"><Badge tone={cs.tone}>{cs.label}</Badge></td>
                      <td className="px-3 py-2.5 text-xs text-fg-secondary">{c.consentSource ? CONSENT_SOURCE[c.consentSource] ?? c.consentSource : '—'}</td>
                      <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>#{t}</Badge>)}</div></td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums text-fg-muted">{dateTime(c.consentAt ?? c.createdAt)}</td>
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
              <Button size="sm" variant="ghost" icon="chevronLeft" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Página anterior" />
              <span className="px-2 py-1 tabular-nums">{page}/{pages}</span>
              <Button size="sm" variant="ghost" icon="chevronRight" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Próxima página" />
            </div>
          </div>
        )}
      </Card>

      <ImportModal open={importing} onClose={() => setImporting(false)} onDone={() => { reload(); reloadBoot(); }} />
      <ConversationDrawer phone={phone} onClose={() => setPhone(null)} />
    </>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const [source, setSource] = useState<string>('web_form');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => { setResult(null); setErr(null); onClose(); };
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.importContacts({ text, tags: tags.split(/[\s,]+/).filter(Boolean), consentSource: source, consentNote: note });
      setResult(r); setText(''); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={close} title="Importar contatos com opt-in" width="max-w-xl"
      footer={result
        ? <Button variant="primary" onClick={close}>Fechar</Button>
        : <><Button variant="ghost" onClick={close}>Cancelar</Button><Button variant="primary" onClick={submit} disabled={busy || !text.trim() || !note.trim()}>{busy ? 'Importando…' : 'Importar'}</Button></>}>
      {result ? (
        <div className="space-y-3 text-sm">
          <Banner tone="ok" title="Importação concluída">
            {num(result.created)} novo(s), {num(result.updated)} atualizado(s).
          </Banner>
          <ul className="space-y-1 text-fg-secondary">
            {result.keptOptOut > 0 && <li><b className="text-danger">{num(result.keptOptOut)}</b> continuam em opt-out: importar nunca tira ninguém da blacklist.</li>}
            {result.invalid > 0 && <li><b className="text-warning">{num(result.invalid)}</b> telefone(s) inválido(s) ignorado(s).</li>}
            {result.duplicates > 0 && <li>{num(result.duplicates)} linha(s) repetida(s) ignorada(s).</li>}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Contatos (um por linha: telefone, nome)" hint="Ex.: 51 99999-0000, Ana Souza. Até 5.000 linhas. Cabeçalho é ignorado.">
            <Textarea rows={7} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={'51 99999-0000, Ana Souza\n11 98888-1111, Bruno Lima'} />
          </Field>
          <Field label="Tags (separadas por vírgula)" hint="Usadas para escolher o público da campanha.">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="clientes-ativos, consultas-semana" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="De onde veio o consentimento">
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                {IMPORT_SOURCES.map((s) => <option key={s} value={s}>{CONSENT_SOURCE[s]}</option>)}
              </Select>
            </Field>
            <Field label="Como e quando consentiram" error={err}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: formulário do site, out/2026" />
            </Field>
          </div>
          <p className="flex gap-2 rounded-md bg-raised px-3 py-2 text-xs leading-relaxed text-fg-secondary">
            <Icon name="shield" size={14} className="mt-px shrink-0 text-brand-text" />
            Cada contato ganha um registro de opt-in (log imutável) com essa origem. Quem já está em opt-out continua bloqueado.
          </p>
        </div>
      )}
    </Modal>
  );
}
