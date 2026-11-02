'use client';
/**
 * Canvas do editor de fluxo, sem dependências. Pan (arrastar o fundo), zoom
 * (roda do mouse / pinça), arrastar etapas, ligar saídas a etapas, soltar uma
 * ligação no vazio para criar a próxima etapa já conectada.
 * Também é usado só-leitura na tela da campanha, com contagem ao vivo por etapa.
 */
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
  type PointerEvent as RPE,
} from 'react';
import { type FlowGraph, type FlowNode, type NodeType, type XY, NODE_LABEL } from '@/lib/disparos/domain/flow-types';
import { NodeCard } from './NodeCard';
import { NODE_W, connect, moveNode, snap } from '@/lib/disparos/domain/graph-ops';
import { NODE_META, PALETTE } from '../node-meta';
import { Icon } from '../icons';
import { cx } from '../format';

export type Selection = { kind: 'node' | 'edge'; id: string } | null;

export interface CanvasHandle {
  fit(): void;
  centerOn(nodeId: string): void;
  zoomBy(f: number): void;
  /** ponto do mundo no centro da área visível */
  viewCenter(): XY;
  zoom(): number;
}

interface Props {
  graph: FlowGraph;
  steps: Map<string, number>;
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** commit=false durante o arraste (não entra no histórico) */
  onChange?: (g: FlowGraph, commit: boolean) => void;
  onCreateAt?: (type: NodeType, pos: XY, from?: { source: string; handle: string }) => void;
  issues?: Map<string, 'error' | 'warning'>;
  live?: Record<string, { count: number; label: string }>;
  animated?: boolean;
  readOnly?: boolean;
  onZoom?: (k: number) => void;
}

interface Measure { w: number; h: number; in: XY; outs: Record<string, XY> }
type View = { x: number; y: number; k: number };

const MIN_K = 0.25, MAX_K = 1.75;

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { graph, steps, selection, onSelect, onChange, onCreateAt, issues, live, animated, readOnly, onZoom }, ref,
) {
  const wrap = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 40, k: 0.9 });
  const viewRef = useRef(view); viewRef.current = view;
  const graphRef = useRef(graph); graphRef.current = graph;
  const [m, setM] = useState<Record<string, Measure>>({});
  const mRef = useRef(m); mRef.current = m;
  const [link, setLink] = useState<{ source: string; handle: string; to: XY; over: string | null } | null>(null);
  const [menu, setMenu] = useState<{ screen: XY; world: XY; from?: { source: string; handle: string } } | null>(null);
  const fitted = useRef(false);

  useEffect(() => { onZoom?.(view.k); }, [view.k, onZoom]);

  // ---- medidas das portas (independe de posição/zoom) ------------------------
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el) return;
    const k = viewRef.current.k;
    const next: Record<string, Measure> = {};
    el.querySelectorAll<HTMLElement>('[data-node]').forEach((nodeEl) => {
      const id = nodeEl.dataset.node!;
      const r = nodeEl.getBoundingClientRect();
      const rel = (h: Element): XY => {
        const b = h.getBoundingClientRect();
        return { x: (b.left + b.width / 2 - r.left) / k, y: (b.top + b.height / 2 - r.top) / k };
      };
      const inEl = nodeEl.querySelector('[data-in]');
      const outs: Record<string, XY> = {};
      nodeEl.querySelectorAll<HTMLElement>('[data-out]').forEach((h) => { outs[h.dataset.out!] = rel(h); });
      next[id] = { w: r.width / k, h: r.height / k, in: inEl ? rel(inEl) : { x: 0, y: 22 }, outs };
    });
    if (JSON.stringify(next) !== JSON.stringify(mRef.current)) setM(next);
  });

  // ---- coordenadas -------------------------------------------------------------
  const toWorld = useCallback((cx_: number, cy: number): XY => {
    const r = wrap.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx_ - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  }, []);

  const fit = useCallback(() => {
    const el = wrap.current;
    const g = graphRef.current;
    if (!el || !g.nodes.length) return;
    const mm = mRef.current;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of g.nodes) {
      const w = mm[n.id]?.w ?? NODE_W, h = mm[n.id]?.h ?? 140;
      x0 = Math.min(x0, n.position.x); y0 = Math.min(y0, n.position.y);
      x1 = Math.max(x1, n.position.x + w); y1 = Math.max(y1, n.position.y + h);
    }
    const pad = 48;
    const W = el.clientWidth, H = el.clientHeight;
    const ideal = Math.min(1.05, (W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0));
    // Abaixo de ~45% o texto fica ilegível: nesse caso alinha pelo começo do fluxo (Início à esquerda).
    const k = Math.max(0.45, ideal);
    const x = ideal < 0.45 ? pad - x0 * k : (W - (x1 - x0) * k) / 2 - x0 * k;
    setView({ k, x, y: Math.max(pad - y0 * k, (H - (y1 - y0) * k) / 2 - y0 * k) });
  }, []);

  useEffect(() => {
    if (!fitted.current && Object.keys(m).length) { fitted.current = true; fit(); }
  }, [m, fit]);

  useImperativeHandle(ref, () => ({
    fit,
    zoom: () => viewRef.current.k,
    zoomBy: (f) => {
      const el = wrap.current!;
      zoomAt(el.clientWidth / 2, el.clientHeight / 2, f);
    },
    centerOn: (id) => {
      const n = graphRef.current.nodes.find((x) => x.id === id);
      const el = wrap.current;
      if (!n || !el) return;
      const mm = mRef.current[id];
      setView((v) => ({ ...v, x: el.clientWidth / 2 - (n.position.x + (mm?.w ?? NODE_W) / 2) * v.k, y: el.clientHeight / 2 - (n.position.y + (mm?.h ?? 120) / 2) * v.k }));
    },
    viewCenter: () => {
      const el = wrap.current!;
      const v = viewRef.current;
      return { x: (el.clientWidth / 2 - v.x) / v.k, y: (el.clientHeight / 2 - v.y) / v.k };
    },
  }), [fit]);

  const zoomAt = (sx: number, sy: number, f: number) => {
    setView((v) => {
      const k = Math.max(MIN_K, Math.min(MAX_K, v.k * f));
      const r = k / v.k;
      return { k, x: sx - (sx - v.x) * r, y: sy - (sy - v.y) * r };
    });
  };

  // roda do mouse: zoom no cursor (listener nativo para poder dar preventDefault)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- arrastes ---------------------------------------------------------------
  const drag = (e: RPE, onMove: (dx: number, dy: number, ev: PointerEvent) => void, onUp?: (moved: boolean, ev: PointerEvent) => void) => {
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      moved = true;
      onMove(ev.clientX - sx, ev.clientY - sy, ev);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      onUp?.(moved, ev);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const onBgDown = (e: RPE) => {
    if (e.button !== 0) return;
    setMenu(null);
    const v0 = viewRef.current;
    drag(e, (dx, dy) => setView({ ...v0, x: v0.x + dx, y: v0.y + dy }), (moved) => { if (!moved) onSelect(null); });
  };

  const onNodeDown = (node: FlowNode) => (e: RPE) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    onSelect({ kind: 'node', id: node.id });
    if (readOnly || !onChange) return;
    const p0 = node.position, k = viewRef.current.k;
    drag(e,
      (dx, dy) => onChange(moveNode(graphRef.current, node.id, { x: snap(p0.x + dx / k), y: snap(p0.y + dy / k) }), false),
      (moved) => { if (moved) onChange(graphRef.current, true); });
  };

  const onHandleDown = (node: FlowNode) => (handle: string, e: RPE) => {
    if (readOnly || !onChange || e.button !== 0) return;
    setMenu(null);
    const overNode = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-node]');
      const id = el?.dataset.node ?? null;
      const t = id ? graphRef.current.nodes.find((n) => n.id === id) : null;
      return t && t.id !== node.id && t.type !== 'start' ? t.id : null;
    };
    setLink({ source: node.id, handle, to: toWorld(e.clientX, e.clientY), over: null });
    drag(e,
      (_dx, _dy, ev) => setLink({ source: node.id, handle, to: toWorld(ev.clientX, ev.clientY), over: overNode(ev) }),
      (moved, ev) => {
        setLink(null);
        if (!moved) return;
        const target = overNode(ev);
        if (target) {
          onChange(connect(graphRef.current, node.id, handle, target), true);
        } else if (onCreateAt) {
          const r = wrap.current!.getBoundingClientRect();
          setMenu({ screen: { x: ev.clientX - r.left, y: ev.clientY - r.top }, world: toWorld(ev.clientX, ev.clientY), from: { source: node.id, handle } });
        }
      });
  };

  // ---- arestas ----------------------------------------------------------------
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const portOut = (id: string, h: string): XY | null => {
    const n = nodeById.get(id), mm = m[id];
    const o = mm?.outs[h];
    return n && o ? { x: n.position.x + o.x, y: n.position.y + o.y } : null;
  };
  const portIn = (id: string): XY | null => {
    const n = nodeById.get(id), mm = m[id];
    return n && mm ? { x: n.position.x + mm.in.x, y: n.position.y + mm.in.y } : null;
  };
  const curve = (a: XY, b: XY) => {
    const dx = Math.max(48, Math.abs(b.x - a.x) * 0.5);
    return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  };
  const edgeTone = (source: string, handle: string) => {
    const n = nodeById.get(source);
    if (handle === 'timeout') return 'warn';
    if (n && (n.type === 'buttons' || n.type === 'template') && n.data.buttons.find((b) => `btn:${b.key}` === handle)?.optOut) return 'bad';
    return 'base';
  };
  const STROKE = { base: '#5d5878', warn: '#fbbf24aa', bad: '#fb7185cc' } as const;

  const linkFrom = link ? portOut(link.source, link.handle) : null;
  const linkTo = link?.over ? portIn(link.over) : link?.to;

  return (
    <div
      ref={wrap}
      onPointerDown={onBgDown}
      onDragOver={(e) => { if (!readOnly && e.dataTransfer.types.includes('application/x-dsp-node')) e.preventDefault(); }}
      onDrop={(e) => {
        const t = e.dataTransfer.getData('application/x-dsp-node') as NodeType;
        if (!t || !onCreateAt) return;
        e.preventDefault();
        const p = toWorld(e.clientX, e.clientY);
        onCreateAt(t, { x: p.x - NODE_W / 2, y: p.y - 20 });
      }}
      className={cx('relative h-full w-full overflow-hidden bg-sidebar touch-none', link ? 'cursor-crosshair' : 'cursor-default')}
      style={{
        backgroundImage: 'radial-gradient(circle, #2c2940 1px, transparent 1.2px)',
        backgroundSize: `${22 * view.k}px ${22 * view.k}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <div ref={layer} className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
          {graph.edges.map((e) => {
            const a = portOut(e.source, e.sourceHandle), b = portIn(e.target);
            if (!a || !b) return null;
            const sel = selection?.kind === 'edge' && selection.id === e.id;
            const tone = edgeTone(e.source, e.sourceHandle);
            const d = curve(a, b);
            return (
              <g key={e.id}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={16} className="pointer-events-auto cursor-pointer"
                  onPointerDown={(ev) => { ev.stopPropagation(); onSelect({ kind: 'edge', id: e.id }); }} />
                <path d={d} fill="none" stroke={sel ? '#a78bfa' : STROKE[tone]} strokeWidth={sel ? 2.5 : 1.75}
                  strokeDasharray={tone === 'warn' && !animated ? '5 4' : undefined}
                  className={animated ? 'edge-live' : undefined} />
                <circle cx={b.x} cy={b.y} r={2.5} fill={sel ? '#a78bfa' : STROKE[tone]} />
              </g>
            );
          })}
          {link && linkFrom && linkTo && (
            <path d={curve(linkFrom, linkTo)} fill="none" stroke={link.over ? '#34d399' : '#a78bfa'} strokeWidth={2} strokeDasharray="6 4" />
          )}
        </svg>

        {graph.nodes.map((n) => (
          <NodeCard
            key={n.id}
            node={n}
            step={steps.get(n.id)}
            selected={selection?.kind === 'node' && selection.id === n.id}
            dropTarget={link?.over === n.id}
            issue={issues?.get(n.id) ?? null}
            connected={new Set(graph.edges.filter((e) => e.source === n.id).map((e) => e.sourceHandle))}
            live={live?.[n.id] ?? null}
            onPointerDown={onNodeDown(n)}
            onHandleDown={onHandleDown(n)}
          />
        ))}
      </div>

      {menu && onCreateAt && (
        <div className="absolute z-20 w-52 rounded-xl border border-line-strong bg-surface p-1 shadow-2xl"
          style={{ left: Math.min(menu.screen.x, (wrap.current?.clientWidth ?? 0) - 216), top: Math.min(menu.screen.y, (wrap.current?.clientHeight ?? 0) - 300) }}
          onPointerDown={(e) => e.stopPropagation()}>
          <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Próxima etapa</div>
          {PALETTE.map((t) => (
            <button key={t} type="button"
              onClick={() => { onCreateAt(t, { x: menu.world.x + 24, y: menu.world.y - 22 }, menu.from); setMenu(null); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-fg hover:bg-raised">
              <Icon name={NODE_META[t].icon} size={15} style={{ color: NODE_META[t].color }} />{NODE_LABEL[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
