/** Operações imutáveis sobre o grafo usadas pelo editor. */
import {
  type FlowButton, type FlowEdge, type FlowGraph, type FlowNode, type NodeDataMap, type NodeType, type XY,
  defaultNodeData, newId, outputHandles,
} from './flow-types';

export const NODE_W = 272;
export const GRID = 10;
export const snap = (v: number) => Math.round(v / GRID) * GRID;

export function addNode(g: FlowGraph, type: NodeType, position: XY): { graph: FlowGraph; id: string } {
  const id = newId(type.slice(0, 3));
  const node = { id, type, position: { x: snap(position.x), y: snap(position.y) }, data: defaultNodeData(type) } as FlowNode;
  return { graph: { ...g, nodes: [...g.nodes, node] }, id };
}

/** Liga source:handle -> target. Uma saída leva a um só destino: substitui a anterior. */
export function connect(g: FlowGraph, source: string, sourceHandle: string, target: string): FlowGraph {
  if (source === target) return g;
  const tgt = g.nodes.find((n) => n.id === target);
  if (!tgt || tgt.type === 'start') return g;
  const edges = g.edges.filter((e) => !(e.source === source && e.sourceHandle === sourceHandle));
  return { ...g, edges: [...edges, { id: newId('e'), source, sourceHandle, target }] };
}

export function removeEdge(g: FlowGraph, id: string): FlowGraph {
  return { ...g, edges: g.edges.filter((e) => e.id !== id) };
}

export function removeNode(g: FlowGraph, id: string): FlowGraph {
  const n = g.nodes.find((x) => x.id === id);
  if (!n || n.type === 'start') return g;
  return { nodes: g.nodes.filter((x) => x.id !== id), edges: g.edges.filter((e) => e.source !== id && e.target !== id) };
}

export function duplicateNode(g: FlowGraph, id: string): { graph: FlowGraph; id: string } | null {
  const n = g.nodes.find((x) => x.id === id);
  if (!n || n.type === 'start') return null;
  const nid = newId(n.type.slice(0, 3));
  const copy = { ...structuredClone(n), id: nid, position: { x: n.position.x + 40, y: n.position.y + 40 } } as FlowNode;
  return { graph: { ...g, nodes: [...g.nodes, copy] }, id: nid };
}

export function moveNode(g: FlowGraph, id: string, pos: XY): FlowGraph {
  return { ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, position: pos } : n)) };
}

/**
 * Atualiza os dados de um nó e remove conexões de saídas que deixaram de existir
 * (ex.: botão apagado).
 */
export function updateData<T extends NodeType>(g: FlowGraph, id: string, patch: Partial<NodeDataMap[T]>): FlowGraph {
  const nodes = g.nodes.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as FlowNode) : n));
  const node = nodes.find((n) => n.id === id)!;
  const valid = new Set(outputHandles(node));
  const edges = g.edges.filter((e: FlowEdge) => e.source !== id || valid.has(e.sourceHandle));
  return { nodes, edges };
}

/** Primeira saída livre de um nó (para "adicionar etapa depois desta"). */
export function firstFreeHandle(g: FlowGraph, node: FlowNode): string | null {
  return outputHandles(node).find((h) => !g.edges.some((e) => e.source === node.id && e.sourceHandle === h)) ?? null;
}

export function slugKey(label: string, taken: string[]): string {
  const base = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'botao';
  let k = base;
  for (let i = 2; taken.includes(k); i++) k = `${base}_${i}`;
  return k;
}

export function newButton(label: string, existing: FlowButton[]): FlowButton {
  return { key: slugKey(label, existing.map((b) => b.key)), label };
}
