'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type FlowGraph, type NodeType, type XY, NODE_LABEL, getNode, stepNumbers } from '@/lib/disparos/domain/flow-types';
import { validateFlow } from '@/lib/disparos/domain/flow-validate';
import { ApiError, api, type FlowDetail } from '../api';
import { useBoot } from '../DisparosShell';
import { useNav } from '../nav';
import { Icon } from '../icons';
import { Badge, Button, Loading } from '../kit';
import { cx, dateTime } from '../format';
import { NODE_META, PALETTE } from '../node-meta';
import { Canvas, type CanvasHandle, type Selection } from './Canvas';
import { Inspector } from './Inspector';
import { TestPanel } from './TestPanel';
import { NODE_W, addNode, connect, duplicateNode, firstFreeHandle, removeEdge, removeNode, updateData } from '@/lib/disparos/domain/graph-ops';

export function FlowEditor({ flowId }: { flowId: string }) {
  const { Link, to } = useNav();
  const { boot } = useBoot();
  const [detail, setDetail] = useState<FlowDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [graph, setGraph] = useState<FlowGraph>({ nodes: [], edges: [] });
  const [name, setName] = useState('');
  const [past, setPast] = useState<FlowGraph[]>([]);
  const [future, setFuture] = useState<FlowGraph[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [panel, setPanel] = useState<'props' | 'test'>('props');
  const [testNode, setTestNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<CanvasHandle>(null);
  const graphRef = useRef(graph); graphRef.current = graph;
  const dragBase = useRef<FlowGraph | null>(null);
  const lastPatch = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    api.flow(flowId).then((d) => { setDetail(d); setGraph(d.flow.draftGraph); setName(d.flow.name); })
      .catch((e) => setLoadError(e.message));
  }, [flowId]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const validation = useMemo(() => validateFlow(graph), [graph]);
  const steps = useMemo(() => stepNumbers(graph), [graph]);
  const issuesByNode = useMemo(() => {
    const m = new Map<string, 'error' | 'warning'>();
    for (const i of validation.issues) if (i.nodeId && m.get(i.nodeId) !== 'error') m.set(i.nodeId, i.severity);
    return m;
  }, [validation]);
  const errors = validation.issues.filter((i) => i.severity === 'error').length;
  const warnings = validation.issues.length - errors;

  // ---- histórico ---------------------------------------------------------------
  const commit = useCallback((next: FlowGraph, prev: FlowGraph = graphRef.current) => {
    setPast((p) => [...p.slice(-60), prev]);
    setFuture([]);
    setGraph(next);
    setDirty(true);
  }, []);

  const onCanvasChange = useCallback((g: FlowGraph, isCommit: boolean) => {
    if (!isCommit) {
      dragBase.current ??= graphRef.current;
      setGraph(g);
      return;
    }
    const base = dragBase.current ?? graphRef.current;
    dragBase.current = null;
    commit(g, base);
  }, [commit]);

  const undo = useCallback(() => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setFuture([graphRef.current, ...future]);
    setGraph(prev);
    setPast(past.slice(0, -1));
    setDirty(true);
  }, [past, future]);
  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setPast([...past, graphRef.current]);
    setGraph(next);
    setFuture(future.slice(1));
    setDirty(true);
  }, [past, future]);

  // ---- ações ---------------------------------------------------------------------
  const createAt = useCallback((type: NodeType, pos: XY, from?: { source: string; handle: string }) => {
    const r = addNode(graphRef.current, type, pos);
    const g = from ? connect(r.graph, from.source, from.handle, r.id) : r.graph;
    commit(g);
    setSelection({ kind: 'node', id: r.id });
    setPanel('props');
  }, [commit]);

  /** Clique na paleta: adiciona depois da etapa selecionada (e liga), ou no centro da tela. */
  const addFromPalette = (type: NodeType) => {
    const g = graphRef.current;
    const sel = selection?.kind === 'node' ? getNode(g, selection.id) : undefined;
    const handle = sel ? firstFreeHandle(g, sel) : null;
    if (sel && handle) {
      const below = g.nodes.filter((n) => n.position.x > sel.position.x + 100 && n.position.x < sel.position.x + NODE_W + 200);
      const y = below.length ? Math.max(sel.position.y, ...below.map((n) => n.position.y + 200)) : sel.position.y;
      createAt(type, { x: sel.position.x + NODE_W + 90, y: Math.min(y, sel.position.y + 600) }, { source: sel.id, handle });
      setTimeout(() => { const last = graphRef.current.nodes.at(-1); if (last) canvas.current?.centerOn(last.id); }, 30);
    } else {
      const c = canvas.current?.viewCenter() ?? { x: 200, y: 200 };
      createAt(type, { x: c.x - NODE_W / 2 + (Math.random() * 40 - 20), y: c.y - 60 });
    }
  };

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    const g = graphRef.current;
    if (selection.kind === 'edge') commit(removeEdge(g, selection.id));
    else if (getNode(g, selection.id)?.type !== 'start') commit(removeNode(g, selection.id));
    setSelection(null);
  }, [selection, commit]);

  const duplicate = useCallback(() => {
    if (selection?.kind !== 'node') return;
    const r = duplicateNode(graphRef.current, selection.id);
    if (r) { commit(r.graph); setSelection({ kind: 'node', id: r.id }); }
  }, [selection, commit]);

  const patchNode = (id: string, patch: object) => {
    const g = graphRef.current;
    const now = Date.now();
    const coalesce = lastPatch.current?.id === id && now - lastPatch.current.at < 900;
    lastPatch.current = { id, at: now };
    const next = updateData(g, id, patch);
    if (coalesce) { setGraph(next); setDirty(true); } else commit(next);
  };

  const save = useCallback(async (): Promise<boolean> => {
    setBusy('save');
    try {
      const d = await api.saveFlow(flowId, { name, graph: graphRef.current });
      setDetail(d);
      setDirty(false);
      setToast({ tone: 'ok', text: 'Rascunho salvo.' });
      return true;
    } catch (e) {
      setToast({ tone: 'bad', text: e instanceof Error ? e.message : 'Erro ao salvar.' });
      return false;
    } finally { setBusy(null); }
  }, [flowId, name]);

  const publish = async () => {
    if (!validation.canPublish) {
      setSelection(null); setPanel('props');
      setToast({ tone: 'bad', text: 'Corrija os erros antes de publicar.' });
      return;
    }
    if (dirty && !(await save())) return;
    setBusy('publish');
    try {
      const d = await api.publishFlow(flowId);
      setDetail(d);
      setToast({ tone: 'ok', text: `Publicado como versão ${d.publishedVersion}. Campanhas novas usam esta versão; as em andamento seguem na versão delas.` });
    } catch (e) {
      setToast({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Erro ao publicar.' });
    } finally { setBusy(null); }
  };

  // ---- atalhos ---------------------------------------------------------------------
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
      else if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [save, undo, redo, duplicate, deleteSelection]);

  if (loadError) return <div className="p-8 text-sm text-danger">{loadError}</div>;
  if (!detail) return <Loading label="Abrindo fluxo…" />;

  const selNode = selection?.kind === 'node' ? getNode(graph, selection.id) : undefined;
  const pubState = !detail.publishedVersion
    ? <Badge>Rascunho · nunca publicado</Badge>
    : detail.hasUnpublishedChanges || dirty
      ? <Badge tone="warn">v{detail.publishedVersion} publicada · alterações pendentes</Badge>
      : <Badge tone="ok">v{detail.publishedVersion} publicada</Badge>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* barra superior */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas px-4">
        <Link href={to('/fluxos')} className="grid size-8 place-items-center rounded-lg text-fg-secondary hover:bg-raised hover:text-fg" title="Voltar para fluxos"><Icon name="chevronLeft" /></Link>
        <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }}
          className="min-w-0 max-w-xs flex-1 rounded-md bg-transparent px-1.5 py-1 text-[15px] font-semibold text-fg hover:bg-raised focus:bg-raised focus:outline-none" />
        <div className="hidden items-center gap-2 md:flex">
          {pubState}
          {dirty ? <span className="text-[11px] text-warning">não salvo</span> : <span className="text-[11px] text-fg-muted">salvo {dateTime(detail.flow.updatedAt)}</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { setSelection(null); setPanel('props'); }}
            className={cx('inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium ring-1 ring-inset',
              errors ? 'bg-danger-subtle text-danger ring-danger/30' : warnings ? 'bg-warning-subtle text-warning ring-warning/30' : 'bg-success-subtle text-success ring-success/25')}>
            <Icon name={errors || warnings ? 'alert' : 'check'} size={14} />
            {errors ? `${errors} erro${errors > 1 ? 's' : ''}` : warnings ? `${warnings} aviso${warnings > 1 ? 's' : ''}` : 'Pronto para publicar'}
          </button>
          <Button size="sm" variant="ghost" icon="undo" onClick={undo} disabled={!past.length} title="Desfazer (Ctrl+Z)" />
          <Button size="sm" icon="play" onClick={() => setPanel(panel === 'test' ? 'props' : 'test')} className={panel === 'test' ? 'ring-success/40 text-success' : ''}>Testar</Button>
          <Button size="sm" icon="save" onClick={save} disabled={busy !== null || !dirty}>{busy === 'save' ? 'Salvando…' : 'Salvar'}</Button>
          <Button size="sm" variant="primary" icon="rocket" onClick={publish} disabled={busy !== null}>{busy === 'publish' ? 'Publicando…' : 'Publicar'}</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* paleta */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-canvas lg:flex">
          <div className="px-4 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Etapas</div>
          <div className="space-y-1 px-2">
            {PALETTE.map((t) => (
              <button key={t} type="button" draggable
                onDragStart={(e) => { e.dataTransfer.setData('application/x-dsp-node', t); e.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => addFromPalette(t)}
                title={NODE_META[t].hint}
                className="group flex w-full cursor-grab items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-raised active:cursor-grabbing">
                <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${NODE_META[t].color} 16%, transparent)`, color: NODE_META[t].color }}>
                  <Icon name={NODE_META[t].icon} size={15} />
                </span>
                <span className="flex-1 text-[13px] font-medium text-fg">{NODE_LABEL[t]}</span>
                <Icon name="plus" size={14} className="text-fg-muted opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
          <div className="mt-auto space-y-2 border-t border-line p-4 text-[11px] leading-relaxed text-fg-muted">
            <p><b className="text-fg-secondary">Arraste</b> para o canvas, ou <b className="text-fg-secondary">clique</b> para adicionar depois da etapa selecionada.</p>
            <p>Puxe a bolinha de uma saída e solte numa etapa para ligar — ou no vazio para criar a próxima.</p>
          </div>
        </aside>

        {/* canvas */}
        <div className="relative min-w-0 flex-1">
          <Canvas
            ref={canvas}
            graph={graph}
            steps={steps}
            selection={selection}
            onSelect={(s) => { setSelection(s); if (s?.kind === 'node' && panel === 'test') return; if (s) setPanel('props'); }}
            onChange={onCanvasChange}
            onCreateAt={createAt}
            issues={issuesByNode}
            live={testNode ? { [testNode]: { count: 1, label: 'Teste está nesta etapa' } } : undefined}
            onZoom={setZoom}
          />
          <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-lg border border-line bg-surface/95 p-0.5 shadow-lg">
            <button className="grid size-7 place-items-center rounded-md text-fg-secondary hover:bg-raised hover:text-fg" onClick={() => canvas.current?.zoomBy(1 / 1.2)} title="Diminuir zoom"><Icon name="zoomOut" size={15} /></button>
            <span className="w-11 text-center text-[11px] tabular-nums text-fg-secondary">{Math.round(zoom * 100)}%</span>
            <button className="grid size-7 place-items-center rounded-md text-fg-secondary hover:bg-raised hover:text-fg" onClick={() => canvas.current?.zoomBy(1.2)} title="Aumentar zoom"><Icon name="zoomIn" size={15} /></button>
            <button className="grid size-7 place-items-center rounded-md text-fg-secondary hover:bg-raised hover:text-fg" onClick={() => canvas.current?.fit()} title="Enquadrar tudo"><Icon name="fit" size={15} /></button>
          </div>
          {selection?.kind === 'edge' && (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-fg-secondary shadow-lg">
              Conexão selecionada
              <Button size="sm" variant="danger" icon="trash" onClick={deleteSelection}>Remover</Button>
            </div>
          )}
          {toast && (
            <div className={cx('absolute left-1/2 top-3 z-20 max-w-lg -translate-x-1/2 rounded-lg border px-3 py-2 text-xs shadow-xl',
              toast.tone === 'ok' ? 'border-success/30 bg-[#0f2a22] text-success' : 'border-danger/30 bg-[#2c1219] text-danger')}>{toast.text}</div>
          )}
        </div>

        {/* painel direito */}
        <aside className="hidden w-[340px] shrink-0 border-l border-line bg-canvas md:block">
          {panel === 'test' ? (
            <TestPanel graph={graph} onActive={setTestNode} onClose={() => setPanel('props')} />
          ) : selNode ? (
            <Inspector
              key={selNode.id}
              node={selNode}
              step={steps.get(selNode.id)}
              issues={validation.issues.filter((i) => i.nodeId === selNode.id)}
              templates={boot?.templates ?? []}
              onPatch={(p) => patchNode(selNode.id, p)}
              onDelete={deleteSelection}
              onDuplicate={duplicate}
            />
          ) : (
            <Overview
              graph={graph}
              steps={steps}
              issues={validation.issues}
              onPick={(id) => { setSelection({ kind: 'node', id }); canvas.current?.centerOn(id); }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function Overview({ graph, steps, issues, onPick }: {
  graph: FlowGraph; steps: Map<string, number>;
  issues: ReturnType<typeof validateFlow>['issues']; onPick: (id: string) => void;
}) {
  const ordered = graph.nodes.filter((n) => n.type !== 'start').sort((a, b) => (steps.get(a.id) ?? 0) - (steps.get(b.id) ?? 0));
  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-line px-4 py-3">
        <div className="text-sm font-semibold">Visão geral</div>
        <p className="mt-0.5 text-xs text-fg-secondary">{ordered.length} etapa{ordered.length === 1 ? '' : 's'}. Selecione uma etapa para editar.</p>
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Validação</div>
        {issues.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-success-subtle px-3 py-2 text-xs text-success"><Icon name="check" size={14} />Tudo certo. Pode publicar.</div>
        ) : (
          <div className="space-y-1.5">
            {issues.map((i, n) => (
              <button key={n} type="button" disabled={!i.nodeId} onClick={() => i.nodeId && onPick(i.nodeId)}
                className={cx('flex w-full gap-2 rounded-lg px-2.5 py-2 text-left text-xs', i.severity === 'error' ? 'bg-danger-subtle' : 'bg-warning-subtle', i.nodeId && 'hover:brightness-125')}>
                <Icon name="alert" size={14} className={cx('mt-px shrink-0', i.severity === 'error' ? 'text-danger' : 'text-warning')} />
                <span className="text-fg/85">{i.message}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Etapas</div>
        <div className="space-y-0.5">
          {ordered.map((n) => (
            <button key={n.id} type="button" onClick={() => onPick(n.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-raised">
              <span className="w-5 text-right text-[11px] tabular-nums text-fg-muted">{steps.get(n.id)}</span>
              <Icon name={NODE_META[n.type].icon} size={14} style={{ color: NODE_META[n.type].color }} />
              <span className="flex-1 truncate text-fg">{NODE_LABEL[n.type]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="m-4 rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-fg-secondary">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-fg"><Icon name="shield" size={14} className="text-brand-text" />Opt-out por design</div>
        Independente do desenho: se o contato escrever <b className="text-fg">SAIR</b>, <b className="text-fg">PARAR</b>, “não quero mais receber”… ou clicar num botão marcado como saída, ele entra na blacklist, a execução encerra e nenhuma campanha envia de novo.
      </div>
      <div className="mx-4 mb-4 text-[11px] leading-relaxed text-fg-muted">
        Atalhos: <kbd>Ctrl+S</kbd> salvar · <kbd>Ctrl+Z</kbd> desfazer · <kbd>Ctrl+D</kbd> duplicar · <kbd>Delete</kbd> remover · roda do mouse = zoom.
      </div>
    </div>
  );
}
