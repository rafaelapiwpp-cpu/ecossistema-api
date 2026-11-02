'use client';
import { useRef, useState, type ReactNode } from 'react';
import {
  type FlowButton, type FlowNode, type NodeDataMap, type NodeType, LIMITS, NODE_LABEL, formatDuration,
} from '@/lib/disparos/domain/flow-types';
import type { FlowIssue } from '@/lib/disparos/domain/flow-validate';
import type { Template } from '@/lib/disparos/server/entities';
import { NODE_META } from '../node-meta';
import { Icon } from '../icons';
import { Badge, Button, Field, Input, Select, Textarea } from '../kit';
import { cx } from '../format';
import { newButton, slugKey } from '@/lib/disparos/domain/graph-ops';

export const VARIABLES = [
  { key: 'nome', label: 'Primeiro nome' },
  { key: 'nome_completo', label: 'Nome completo' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'data_consulta', label: 'Data da consulta (atributo)' },
];

interface Props {
  node: FlowNode;
  step: number | undefined;
  issues: FlowIssue[];
  templates: Template[];
  onPatch: (patch: Partial<NodeDataMap[NodeType]>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function Inspector({ node, step, issues, templates, onPatch, onDelete, onDuplicate }: Props) {
  const meta = NODE_META[node.type];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${meta.color} 18%, transparent)`, color: meta.color }}>
          <Icon name={meta.icon} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{node.type === 'start' ? 'Gatilho' : `Etapa ${step}`}</div>
          <div className="text-sm font-semibold">{NODE_LABEL[node.type]}</div>
          <p className="mt-1 text-xs leading-relaxed text-fg-secondary">{meta.hint}</p>
        </div>
        {node.type !== 'start' && (
          <div className="flex gap-0.5">
            <button className="rounded-md p-1.5 text-fg-muted hover:bg-raised hover:text-fg" title="Duplicar (Ctrl+D)" onClick={onDuplicate}><Icon name="copy" size={15} /></button>
            <button className="rounded-md p-1.5 text-fg-muted hover:bg-danger-subtle hover:text-danger" title="Excluir (Delete)" onClick={onDelete}><Icon name="trash" size={15} /></button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {issues.length > 0 && (
          <div className="space-y-1.5">
            {issues.map((i, n) => (
              <div key={n} className={cx('flex gap-2 rounded-lg px-2.5 py-2 text-xs', i.severity === 'error' ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning')}>
                <Icon name="alert" size={14} className="mt-px shrink-0" /><span className="text-fg/85">{i.message}</span>
              </div>
            ))}
          </div>
        )}
        <Form node={node} templates={templates} onPatch={onPatch} />
      </div>
    </div>
  );
}

function Form({ node, templates, onPatch }: { node: FlowNode; templates: Template[]; onPatch: Props['onPatch'] }) {
  switch (node.type) {
    case 'start':
      return <p className="text-sm text-fg-secondary">O fluxo começa quando a campanha envia para o contato. A primeira etapa precisa ser um <b className="text-fg">Modelo aprovado</b> — a Meta só permite mensagem livre depois que o contato responde (janela de 24h).</p>;

    case 'text':
      return (
        <>
          <MessageField value={node.data.text} max={LIMITS.textMax} onChange={(text) => onPatch({ text })} rows={7} />
          <WindowNote />
        </>
      );

    case 'audio':
      return <AudioForm data={node.data} onPatch={onPatch} />;

    case 'delay':
      return <DurationField label="Aguardar" seconds={node.data.seconds} onChange={(seconds) => onPatch({ seconds: seconds ?? 60 })}
        presets={[10, 60, 300, 1800, 3600, 86400]} />;

    case 'buttons':
      return (
        <>
          <MessageField value={node.data.text} max={LIMITS.interactiveBodyMax} onChange={(text) => onPatch({ text })} rows={4} />
          <ButtonsEditor buttons={node.data.buttons} max={LIMITS.replyButtonsMax} labelMax={LIMITS.replyButtonTitleMax} onChange={(buttons) => onPatch({ buttons })} />
          <DurationField label="Se não responder em" seconds={node.data.timeoutSeconds} nullable onChange={(timeoutSeconds) => onPatch({ timeoutSeconds })}
            presets={[300, 3600, 7200, 86400]} hint="Depois desse tempo, segue pela saída “sem resposta”." />
          <WindowNote />
        </>
      );

    case 'template':
      return <TemplateForm data={node.data} templates={templates} onPatch={onPatch} />;

    case 'optout':
      return (
        <>
          <div className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2.5 text-xs leading-relaxed text-fg/85">
            O contato entra na <b className="text-danger">blacklist do cliente</b>, todas as execuções dele são encerradas e nenhuma campanha futura envia para esse número.
          </div>
          <Field label="Motivo registrado" hint="Aparece na tela Blacklist (auditoria LGPD).">
            <Input value={node.data.reason} onChange={(e) => onPatch({ reason: e.target.value })} />
          </Field>
          <Toggle checked={node.data.confirmationText !== null} label="Enviar confirmação de saída"
            onChange={(on) => onPatch({ confirmationText: on ? 'Pronto, você não vai mais receber nossas mensagens automáticas.' : null })} />
          {node.data.confirmationText !== null && (
            <MessageField value={node.data.confirmationText} max={LIMITS.textMax} rows={3} onChange={(confirmationText) => onPatch({ confirmationText })}
              hint="Só é enviada se a janela de 24h estiver aberta." />
          )}
        </>
      );

    case 'end':
      return <p className="text-sm text-fg-secondary">Nada a configurar. Saídas sem conexão também encerram o fluxo — use Fim para deixar isso explícito no desenho.</p>;
  }
}

// ---------------------------------------------------------------------------

function WindowNote() {
  return (
    <div className="flex gap-2 rounded-lg bg-raised px-3 py-2 text-[11px] leading-relaxed text-fg-secondary">
      <Icon name="clock" size={13} className="mt-px shrink-0 text-warning" />
      Mensagem livre: só sai com a janela de 24h aberta (o contato respondeu nas últimas 24h). Se a janela fechar, a execução para nesta etapa.
    </div>
  );
}

function MessageField({ value, onChange, max, rows, hint }: { value: string; onChange: (v: string) => void; max: number; rows: number; hint?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (k: string) => {
    const el = ref.current;
    const tok = `{{${k}}}`;
    if (!el) return onChange(value + tok);
    const s = el.selectionStart ?? value.length, e = el.selectionEnd ?? value.length;
    onChange(value.slice(0, s) + tok + value.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tok.length, s + tok.length); });
  };
  return (
    <Field label="Mensagem" hint={hint} right={<span className={cx('text-[11px] tabular-nums', value.length > max ? 'text-danger' : 'text-fg-muted')}>{value.length}/{max}</span>}>
      <Textarea ref={ref} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {VARIABLES.map((v) => (
          <button key={v.key} type="button" title={v.label} onClick={() => insert(v.key)}
            className="rounded-md bg-brand-subtle px-1.5 py-0.5 font-mono text-[10px] text-brand-text hover:bg-brand/25">{`{{${v.key}}}`}</button>
        ))}
      </div>
    </Field>
  );
}

const UNITS = [{ s: 1, l: 'segundos' }, { s: 60, l: 'minutos' }, { s: 3600, l: 'horas' }, { s: 86400, l: 'dias' }];
function DurationField({ label, seconds, onChange, nullable, presets, hint }:
  { label: string; seconds: number | null; onChange: (s: number | null) => void; nullable?: boolean; presets: number[]; hint?: string }) {
  const unit = seconds ? [...UNITS].reverse().find((u) => seconds % u.s === 0) : UNITS[1];
  const [u, setU] = useState(unit?.s ?? 60);
  const amount = seconds != null ? seconds / u : '';
  return (
    <div className="space-y-2">
      {nullable && <Toggle checked={seconds !== null} label={label} onChange={(on) => onChange(on ? 86400 : null)} />}
      {seconds !== null && (
        <Field label={nullable ? 'Tempo' : label} hint={hint}>
          <div className="flex gap-2">
            <Input type="number" min={1} className="w-24 tabular-nums" value={Number.isInteger(amount) ? amount : Number(amount).toFixed(2)}
              onChange={(e) => onChange(Math.max(1, Math.round(Number(e.target.value) * u)))} />
            <Select value={u} onChange={(e) => { const nu = Number(e.target.value); setU(nu); onChange(Math.max(1, Math.round(Number(amount || 1)) * nu)); }}>
              {UNITS.map((x) => <option key={x.s} value={x.s}>{x.l}</option>)}
            </Select>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {presets.map((p) => (
              <button key={p} type="button" onClick={() => { onChange(p); setU([...UNITS].reverse().find((x) => p % x.s === 0)!.s); }}
                className={cx('rounded-md px-2 py-0.5 text-[11px] ring-1 ring-inset', seconds === p ? 'bg-brand-subtle text-brand-text ring-brand/30' : 'text-fg-secondary ring-line hover:text-fg')}>
                {formatDuration(p)}
              </button>
            ))}
          </div>
        </Field>
      )}
      {nullable && seconds === null && <p className="text-xs text-fg-muted">Espera a resposta indefinidamente.</p>}
    </div>
  );
}

function ButtonsEditor({ buttons, onChange, max, labelMax, fixed }: { buttons: FlowButton[]; onChange: (b: FlowButton[]) => void; max: number; labelMax: number; fixed?: boolean }) {
  const set = (i: number, patch: Partial<FlowButton>) => onChange(buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <Field label={`Botões (${buttons.length}/${max})`} hint={fixed ? 'Os botões vêm do modelo aprovado; só dá para marcar quais tiram da lista.' : 'Cada botão vira uma saída na etapa. “Tirar da lista” coloca o contato na blacklist mesmo sem ligação.'}>
      <div className="space-y-1.5">
        {buttons.map((b, i) => (
          <div key={b.key} className="flex items-center gap-1.5">
            <Input value={b.label} maxLength={labelMax} disabled={fixed} onChange={(e) => set(i, { label: e.target.value })} className="h-8" />
            <button type="button" title="Tirar da lista (opt-out)" onClick={() => set(i, { optOut: !b.optOut })}
              className={cx('flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] ring-1 ring-inset', b.optOut ? 'bg-danger-subtle text-danger ring-danger/30' : 'text-fg-muted ring-line hover:text-fg')}>
              <Icon name="ban" size={13} />sair
            </button>
            {!fixed && (
              <button type="button" disabled={buttons.length <= 1} onClick={() => onChange(buttons.filter((_, j) => j !== i))}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-raised hover:text-danger disabled:opacity-30"><Icon name="x" size={14} /></button>
            )}
          </div>
        ))}
        {!fixed && buttons.length < max && (
          <Button size="sm" variant="ghost" icon="plus" onClick={() => onChange([...buttons, newButton(`Opção ${buttons.length + 1}`, buttons)])}>Adicionar botão</Button>
        )}
      </div>
    </Field>
  );
}

function AudioForm({ data, onPatch }: { data: NodeDataMap['audio']; onPatch: Props['onPatch'] }) {
  return (
    <>
      <div className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-center">
        <Icon name="mic" size={20} className="mx-auto text-[var(--chart-5)]" />
        <label className="mt-2 inline-block cursor-pointer text-sm font-medium text-brand-text hover:underline">
          Escolher arquivo de áudio
          <input type="file" accept="audio/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const url = URL.createObjectURL(f);
            const a = new Audio(url);
            a.onloadedmetadata = () => onPatch({ durationSeconds: Math.round(a.duration) || undefined });
            onPatch({ mediaUrl: url, fileName: f.name, mediaId: undefined, voice: /ogg|opus/i.test(f.type || f.name) ? data.voice : false });
          }} />
        </label>
        <p className="mt-1 text-[11px] text-fg-muted">Nota de voz: .ogg (OPUS). Outros: .mp3, .m4a, .aac, .amr — até 16 MB.</p>
      </div>
      {data.mediaUrl && data.mediaUrl.startsWith('blob:') && <audio src={data.mediaUrl} controls className="h-9 w-full" />}
      <Field label="Ou URL pública do arquivo" hint="No modo Meta o arquivo é enviado para /media e o fluxo guarda o media_id.">
        <Input value={data.mediaUrl.startsWith('blob:') ? '' : data.mediaUrl} placeholder="https://…/audio.ogg"
          onChange={(e) => onPatch({ mediaUrl: e.target.value, fileName: e.target.value.split('/').pop() ?? '', mediaId: undefined })} />
      </Field>
      <Toggle checked={data.voice} label="Enviar como nota de voz (aparece como áudio gravado)" onChange={(voice) => onPatch({ voice })} />
      <WindowNote />
    </>
  );
}

function TemplateForm({ data, templates, onPatch }: { data: NodeDataMap['template']; templates: Template[]; onPatch: Props['onPatch'] }) {
  const approved = templates.filter((t) => t.status === 'APPROVED');
  const others = templates.filter((t) => t.status !== 'APPROVED');
  const count = (data.bodyPreview.match(/\{\{\d+\}\}/g) ?? []).length;
  const pick = (name: string) => {
    const t = templates.find((x) => x.name === name);
    if (!t) return;
    const keys: string[] = [];
    const buttons = t.buttons.map((b) => {
      const k = slugKey(b.text, keys); keys.push(k);
      return { key: k, label: b.text, optOut: b.optOut };
    });
    const n = (t.bodyText.match(/\{\{\d+\}\}/g) ?? []).length;
    onPatch({
      templateName: t.name, language: t.language, category: t.category, bodyPreview: t.bodyText, buttons,
      variables: Array.from({ length: n }, (_, i) => (i === 0 ? '{{nome}}' : data.variables[i] ?? '')),
    });
  };
  return (
    <>
      <Field label="Modelo" hint="Lista de modelos da conta (WABA). Só os aprovados podem ser usados.">
        <Select value={data.templateName} onChange={(e) => pick(e.target.value)}>
          <option value="" disabled>Escolha um modelo aprovado…</option>
          {approved.map((t) => <option key={t.id} value={t.name}>{t.name} · {t.category}</option>)}
          {others.map((t) => <option key={t.id} value={t.name} disabled>{t.name} · {t.status.toLowerCase()}</option>)}
        </Select>
      </Field>
      {data.templateName && (
        <>
          <div className="flex gap-1.5"><Badge tone="accent">{data.category}</Badge><Badge>{data.language}</Badge></div>
          {data.category === 'MARKETING' && (
            <p className="text-[11px] leading-relaxed text-fg-muted">Marketing: a Meta pode reter a entrega para quem recebe muitas mensagens (erro 131049), e quem parar marketing pelo WhatsApp entra na blacklist automaticamente (131050).</p>
          )}
          {count > 0 && (
            <Field label="Variáveis do modelo" hint="Use {{nome}}, {{data_consulta}}… ou um texto fixo.">
              <div className="space-y-1.5">
                {Array.from({ length: count }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-9 shrink-0 font-mono text-[11px] text-fg-muted">{`{{${i + 1}}}`}</span>
                    <Input className="h-8 font-mono text-xs" value={data.variables[i] ?? ''}
                      onChange={(e) => { const v = [...data.variables]; v[i] = e.target.value; onPatch({ variables: v }); }} />
                  </div>
                ))}
              </div>
            </Field>
          )}
          {data.buttons.length > 0 && (
            <>
              <ButtonsEditor fixed buttons={data.buttons} max={LIMITS.templateQuickRepliesMax} labelMax={LIMITS.templateButtonTextMax} onChange={(buttons) => onPatch({ buttons })} />
              <DurationField label="Se não responder em" seconds={data.timeoutSeconds} nullable onChange={(timeoutSeconds) => onPatch({ timeoutSeconds })}
                presets={[3600, 86400, 172800]} hint="Depois desse tempo, segue pela saída “sem resposta”." />
            </>
          )}
        </>
      )}
    </>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center gap-2.5 text-left text-sm text-fg">
      <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-line-strong')}>
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span className="text-[13px]">{label}</span>
    </button>
  );
}
