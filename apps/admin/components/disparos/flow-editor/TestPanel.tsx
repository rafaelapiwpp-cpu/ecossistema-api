'use client';
/**
 * Testa o rascunho no próprio editor rodando o MESMO motor (flow-engine) que a
 * campanha usa. Nada é enviado: é uma conversa simulada com um contato fictício.
 */
import { useEffect, useRef, useState } from 'react';
import { advance, encodeButtonPayload, newRunState, type EngineEvent, type RunState } from '@/lib/disparos/domain/flow-engine';
import { isOptOutText } from '@/lib/disparos/domain/optout';
import { type FlowGraph, formatDuration, getNode } from '@/lib/disparos/domain/flow-types';
import { Icon } from '../icons';
import { Button } from '../kit';
import { RUN_STATUS, cx, stepLabel } from '../format';

const SAMPLE = { nome: 'Ana', nome_completo: 'Ana Souza', telefone: '+5551999990000', data_consulta: 'ter, 4/11 às 14h' };
const H24 = 24 * 3600_000;

type Line =
  | { kind: 'out'; text: string; nodeId: string; buttons?: { key: string; label: string; optOut?: boolean }[]; audio?: boolean }
  | { kind: 'in'; text: string }
  | { kind: 'sys'; text: string; tone?: 'bad' | 'warn' | 'ok' };

export function TestPanel({ graph, onActive, onClose }: { graph: FlowGraph; onActive: (nodeId: string | null) => void; onClose: () => void }) {
  const [run, setRun] = useState<RunState | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [now, setNow] = useState(0);
  const [windowUntil, setWindowUntil] = useState<number | null>(null);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [lines]);
  useEffect(() => { onActive(run && !['completed', 'opted_out', 'failed', 'canceled'].includes(run.status) ? run.currentNodeId : null); }, [run, onActive]);
  useEffect(() => () => onActive(null), [onActive]);

  const step = (prev: RunState, ev: EngineEvent, at: number, win: number | null, extra: Line[] = []) => {
    const { state, actions } = advance(graph, prev, ev, { now: at, optedOut: false, windowOpenUntil: win });
    const out: Line[] = [...extra];
    for (const a of actions) {
      if (a.type === 'send') {
        const node = getNode(graph, a.nodeId);
        const buttons = node && (node.type === 'buttons' || node.type === 'template') ? node.data.buttons : undefined;
        const body = a.message.type === 'interactive_buttons' ? a.message.body : a.preview;
        out.push({ kind: 'out', nodeId: a.nodeId, text: body, buttons: buttons?.length ? buttons : undefined, audio: a.nodeType === 'audio' });
      } else if (a.type === 'optout') {
        out.push({ kind: 'sys', tone: 'bad', text: `Contato entrou na blacklist (${a.source === 'button' ? 'botão de saída' : 'etapa Blacklist'}). Não recebe mais nenhum disparo.` });
      } else if (a.type === 'step' && a.outcome === 'window_closed') {
        out.push({ kind: 'sys', tone: 'warn', text: `${stepLabel(graph, a.nodeId)} não saiu: janela de 24h fechada. Use um Modelo aprovado antes de mensagens livres.` });
      } else if (a.type === 'step' && a.outcome === 'timeout') {
        out.push({ kind: 'sys', text: 'Sem resposta no prazo → seguiu pela saída “sem resposta”.' });
      }
    }
    if (state.status === 'waiting_delay' && state.wakeAt) out.push({ kind: 'sys', text: `Aguardando ${formatDuration(Math.round((state.wakeAt - at) / 1000))}…` });
    if (state.status === 'completed') out.push({ kind: 'sys', tone: 'ok', text: 'Fluxo concluído.' });
    if (state.status === 'failed') out.push({ kind: 'sys', tone: 'bad', text: `Execução parou: ${state.lastError === 'window_closed' ? 'janela de 24h fechada' : state.lastError}.` });
    setLines((l) => [...l, ...out]);
    setRun(state);
    setNow(at);
  };

  const start = () => {
    setLines([]);
    setWindowUntil(null);
    step(newRunState('teste', { ...SAMPLE }), { kind: 'start' }, 0, null, [{ kind: 'sys', text: 'Disparo iniciado para Ana Souza (contato fictício). Janela de 24h fechada.' }]);
  };

  const reply = (nodeId: string, key: string, label: string) => {
    if (!run) return;
    const win = now + H24;
    setWindowUntil(win);
    step(run, { kind: 'reply', payload: encodeButtonPayload(run.id, nodeId, key) }, now + 5000, win, [{ kind: 'in', text: label }]);
  };

  const sendText = () => {
    const t = text.trim();
    if (!t || !run) return;
    setText('');
    const at = now + 5000, win = at + H24;
    setWindowUntil(win);
    if (isOptOutText(t)) {
      // Igual ao service: pedido de saída vale em qualquer ponto, antes do fluxo.
      setLines((l) => [...l, { kind: 'in', text: t }, { kind: 'sys', tone: 'bad', text: 'Pedido de saída detectado → contato na blacklist e execução encerrada.' }]);
      setRun({ ...run, status: 'opted_out', wakeAt: null });
      setNow(at);
      return;
    }
    if (run.status === 'waiting_reply') step(run, { kind: 'reply', text: t }, at, win, [{ kind: 'in', text: t }]);
    else { setLines((l) => [...l, { kind: 'in', text: t }, { kind: 'sys', text: 'Mensagem recebida (abre a janela de 24h). Nenhuma etapa aguardava resposta.' }]); setNow(at); }
  };

  const wake = () => run?.wakeAt && step(run, { kind: 'wake' }, run.wakeAt, windowUntil);

  const lastOutWithButtons = [...lines].reverse().find((l): l is Extract<Line, { kind: 'out' }> => l.kind === 'out' && !!l.buttons);
  const canClick = (l: Line) => run?.status === 'waiting_reply' && l === lastOutWithButtons;
  const st = run ? RUN_STATUS[run.status] : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Icon name="play" size={14} className="text-success" />
        <div className="flex-1 text-sm font-semibold">Testar fluxo</div>
        {st && <span className="text-[11px] text-fg-secondary">{st.label}</span>}
        <button className="rounded-md p-1 text-fg-muted hover:bg-raised hover:text-fg" onClick={onClose} aria-label="Fechar teste"><Icon name="x" size={15} /></button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#0e0d14] px-3 py-3">
        {!run && (
          <div className="px-2 py-8 text-center text-sm text-fg-secondary">
            Simula o rascunho atual com um contato fictício usando o mesmo motor da campanha. Nada é enviado.
            <div className="mt-4"><Button variant="primary" icon="play" onClick={start}>Iniciar teste</Button></div>
          </div>
        )}
        {lines.map((l, i) => l.kind === 'sys' ? (
          <div key={i} className={cx('mx-auto max-w-[92%] rounded-md px-2 py-1 text-center text-[11px]',
            l.tone === 'bad' ? 'bg-danger-subtle text-danger' : l.tone === 'warn' ? 'bg-warning-subtle text-warning' : l.tone === 'ok' ? 'bg-success-subtle text-success' : 'text-fg-muted')}>{l.text}</div>
        ) : l.kind === 'in' ? (
          <div key={i} className="ml-auto w-fit max-w-[80%] rounded-lg rounded-tr-sm bg-[#1f4d3d] px-2.5 py-1.5 text-[13px] text-fg">{l.text}</div>
        ) : (
          <div key={i} className="w-fit max-w-[88%]">
            <div className="rounded-lg rounded-tl-sm bg-raised px-2.5 py-1.5 text-[13px] leading-snug text-fg">
              {l.audio ? <span className="flex items-center gap-2"><Icon name="mic" size={14} className="text-[var(--chart-5)]" />{l.text}</span> : <span className="whitespace-pre-wrap">{l.text}</span>}
            </div>
            {l.buttons && (
              <div className="mt-1 grid gap-1">
                {l.buttons.map((b) => (
                  <button key={b.key} type="button" disabled={!canClick(l)} onClick={() => reply(l.nodeId, b.key, b.label)}
                    className={cx('rounded-lg bg-raised px-2 py-1.5 text-center text-[13px] font-medium transition-colors disabled:opacity-40',
                      b.optOut ? 'text-danger' : 'text-info', canClick(l) && 'hover:bg-overlay')}>{b.label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>

      {run && (
        <div className="space-y-2 border-t border-line p-3">
          <div className="flex flex-wrap gap-1.5">
            {run.wakeAt && (run.status === 'waiting_delay' || run.status === 'waiting_reply') && (
              <Button size="sm" icon="clock" onClick={wake}>{run.status === 'waiting_delay' ? 'Pular espera' : 'Simular “sem resposta”'}</Button>
            )}
            <Button size="sm" variant="ghost" icon="undo" onClick={start}>Recomeçar</Button>
          </div>
          <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); sendText(); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Responder como o contato (tente “SAIR”)"
              disabled={['completed', 'opted_out', 'failed'].includes(run.status)}
              className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-sidebar px-2.5 text-[13px] placeholder:text-fg-muted focus:border-brand focus:outline-none disabled:opacity-40" />
            <Button size="sm" variant="primary" icon="send" type="submit" aria-label="Enviar" />
          </form>
        </div>
      )}
    </div>
  );
}
