/**
 * Tipos do grafo de fluxo. É o JSON salvo em flows.draft_graph / flow_versions.graph.
 *
 * Saídas (sourceHandle) de cada nó:
 *   start, text, audio, delay, template (sem botões)  -> "next"
 *   buttons / template com botões                    -> "btn:<key>" para cada botão + "timeout"
 *   optout, end                                      -> nenhuma (terminais)
 */

export type NodeType = 'start' | 'template' | 'text' | 'audio' | 'delay' | 'buttons' | 'optout' | 'end';

export interface XY { x: number; y: number }

export interface FlowButton {
  key: string;            // estável, usado no handle "btn:<key>" e no payload
  label: string;          // texto do botão (20 chars em botões interativos, 25 em modelos)
  optOut?: boolean;       // clicar = entrar na blacklist, mesmo sem conexão no fluxo
}

export interface StartData { trigger: 'campaign' | 'manual' }

export interface TemplateData {
  /** id do template no cadastro (tabela template); vazio em presets antigos. */
  templateId?: string;
  templateName: string;
  language: string;                 // pt_BR
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  bodyPreview: string;              // texto do modelo com {{1}}, {{2}}...
  /** Para cada {{n}}: de onde vem o valor. Ex.: "contact.name", "var.data_consulta" ou texto fixo. */
  variables: string[];
  buttons: FlowButton[];            // quick replies do modelo, na ordem (index 0..n)
  timeoutSeconds: number | null;    // só conta se houver botões
}

export interface TextData { text: string }

export interface AudioData {
  mediaUrl: string;                 // mock/preview; na Meta subimos e usamos mediaId
  mediaId?: string;
  voice: boolean;                   // true = nota de voz (exige .ogg OPUS)
  fileName?: string;
  durationSeconds?: number;
}

export interface DelayData { seconds: number }

export interface ButtonsData {
  text: string;
  buttons: FlowButton[];            // 1..3 (limite da Meta para reply buttons)
  timeoutSeconds: number | null;    // null = espera indefinidamente
}

export interface OptOutData {
  confirmationText: string | null;  // enviado se a janela de 24h estiver aberta
  reason: string;
}

export type NodeDataMap = {
  start: StartData;
  template: TemplateData;
  text: TextData;
  audio: AudioData;
  delay: DelayData;
  buttons: ButtonsData;
  optout: OptOutData;
  end: Record<string, never>;
};

export type FlowNode<T extends NodeType = NodeType> = {
  [K in T]: { id: string; type: K; position: XY; data: NodeDataMap[K] }
}[T];

export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle: string;  // "next" | "btn:<key>" | "timeout"
  target: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export const NODE_LABEL: Record<NodeType, string> = {
  start: 'Início',
  template: 'Modelo aprovado',
  text: 'Texto',
  audio: 'Áudio',
  delay: 'Aguardar',
  buttons: 'Botões',
  optout: 'Blacklist',
  end: 'Fim',
};

/** Limites da WhatsApp Cloud API usados na validação. */
export const LIMITS = {
  textMax: 4096,
  interactiveBodyMax: 1024,
  replyButtonsMax: 3,
  replyButtonTitleMax: 20,
  templateQuickRepliesMax: 10,
  templateButtonTextMax: 25,
  serviceWindowSeconds: 24 * 60 * 60,
  delayMinSeconds: 1,
  delayMaxSeconds: 30 * 24 * 60 * 60,
  voiceNotePlayableBytes: 512 * 1024,
} as const;

export function outputHandles(node: FlowNode): string[] {
  switch (node.type) {
    case 'start':
    case 'text':
    case 'audio':
    case 'delay':
      return ['next'];
    case 'template':
      return node.data.buttons.length
        ? [...node.data.buttons.map((b) => `btn:${b.key}`), 'timeout']
        : ['next'];
    case 'buttons':
      return [...node.data.buttons.map((b) => `btn:${b.key}`), 'timeout'];
    case 'optout':
    case 'end':
      return [];
  }
}

export function handleLabel(node: FlowNode, handle: string): string {
  if (handle === 'next') return 'próxima';
  if (handle === 'timeout') return 'sem resposta';
  if (handle.startsWith('btn:') && (node.type === 'buttons' || node.type === 'template')) {
    const key = handle.slice(4);
    return node.data.buttons.find((b) => b.key === key)?.label ?? key;
  }
  return handle;
}

export function nextTarget(graph: FlowGraph, nodeId: string, handle: string): string | null {
  return graph.edges.find((e) => e.source === nodeId && e.sourceHandle === handle)?.target ?? null;
}

export function getNode(graph: FlowGraph, id: string | null | undefined): FlowNode | undefined {
  return id ? graph.nodes.find((n) => n.id === id) : undefined;
}

/**
 * Numeração ETAPA 1..N: percorre cada ramo até o fim antes do próximo
 * (primeiro botão primeiro), a partir do Início. Assim um ramo fica com números
 * seguidos. Nós soltos recebem números depois, para continuarem visíveis.
 */
export function stepNumbers(graph: FlowGraph): Map<string, number> {
  const out = new Map<string, number>();
  const start = graph.nodes.find((n) => n.type === 'start');
  let n = 0;
  if (start) {
    const stack = [start.id];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = getNode(graph, id);
      if (!node) continue;
      if (node.type !== 'start') out.set(id, ++n);
      const outs = graph.edges
        .filter((e) => e.source === id)
        .sort((a, b) => handleOrder(node, b.sourceHandle) - handleOrder(node, a.sourceHandle));
      for (const e of outs) if (!seen.has(e.target)) stack.push(e.target);
    }
  }
  for (const node of graph.nodes) {
    if (node.type !== 'start' && !out.has(node.id)) out.set(node.id, ++n);
  }
  return out;
}

function handleOrder(node: FlowNode, handle: string): number {
  const hs = outputHandles(node);
  const i = hs.indexOf(handle);
  return i === -1 ? 99 : i;
}

export function newId(prefix = 'n'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${rnd}`;
}

export function defaultNodeData<T extends NodeType>(type: T): NodeDataMap[T] {
  const d: { [K in NodeType]: NodeDataMap[K] } = {
    start: { trigger: 'campaign' },
    template: {
      templateName: '', language: 'pt_BR', category: 'UTILITY', bodyPreview: '',
      variables: [], buttons: [], timeoutSeconds: 24 * 3600,
    },
    text: { text: 'Olá {{nome}}! ' },
    audio: { mediaUrl: '', voice: true, fileName: '' },
    delay: { seconds: 60 },
    buttons: {
      text: 'Podemos confirmar?',
      buttons: [
        { key: 'confirmar', label: 'Confirmar' },
        { key: 'cancelar', label: 'Cancelar' },
      ],
      timeoutSeconds: 24 * 3600,
    },
    optout: {
      confirmationText: 'Pronto, você não vai mais receber nossas mensagens automáticas.',
      reason: 'Pediu para sair',
    },
    end: {},
  };
  return structuredClone(d[type]) as NodeDataMap[T];
}

/** "Olá {{nome}}" -> "Olá Ana". Variáveis desconhecidas ficam vazias. */
export function renderVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}

export function formatDuration(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400} ${seconds === 86400 ? 'dia' : 'dias'}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}
