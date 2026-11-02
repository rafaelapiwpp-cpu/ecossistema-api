import {
  FlowGraph, FlowNode, LIMITS, NODE_LABEL, getNode, outputHandles, stepNumbers,
} from './flow-types';

export interface FlowIssue {
  severity: 'error' | 'warning';
  nodeId?: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  issues: FlowIssue[];
  canPublish: boolean;
}

/** Nós que só podem sair dentro da janela de atendimento de 24h. */
const SESSION_TYPES = new Set(['text', 'audio', 'buttons']);

export function validateFlow(graph: FlowGraph): ValidationResult {
  const issues: FlowIssue[] = [];
  const steps = stepNumbers(graph);
  const name = (n: FlowNode) =>
    n.type === 'start' ? 'Início' : `Etapa ${steps.get(n.id)} (${NODE_LABEL[n.type]})`;
  const push = (severity: FlowIssue['severity'], code: string, message: string, nodeId?: string) =>
    issues.push({ severity, code, message, nodeId });

  // ---- estrutura -----------------------------------------------------------
  const starts = graph.nodes.filter((n) => n.type === 'start');
  if (starts.length === 0) push('error', 'no_start', 'O fluxo precisa de um nó de Início.');
  if (starts.length > 1) starts.slice(1).forEach((s) => push('error', 'many_starts', 'Só pode haver um Início.', s.id));

  const ids = new Set(graph.nodes.map((n) => n.id));
  const handleUse = new Map<string, number>();
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      push('error', 'dangling_edge', 'Há uma conexão apontando para uma etapa que não existe mais.');
      continue;
    }
    const src = getNode(graph, e.source)!;
    if (!outputHandles(src).includes(e.sourceHandle)) {
      push('error', 'bad_handle', `${name(src)} tem uma conexão de uma saída que não existe mais. Reconecte.`, src.id);
    }
    const k = `${e.source}|${e.sourceHandle}`;
    handleUse.set(k, (handleUse.get(k) ?? 0) + 1);
  }
  for (const [k, count] of handleUse) {
    if (count > 1) {
      const nodeId = k.split('|')[0];
      push('error', 'handle_reused', `${name(getNode(graph, nodeId)!)} tem uma saída ligada a duas etapas. Cada saída leva a uma só.`, nodeId);
    }
  }

  const start = starts[0];
  if (start && !graph.edges.some((e) => e.source === start.id)) {
    push('error', 'start_unconnected', 'Conecte o Início à primeira etapa.', start.id);
  }

  // ---- conteúdo de cada nó -------------------------------------------------
  for (const node of graph.nodes) {
    const who = name(node);
    switch (node.type) {
      case 'text': {
        const t = node.data.text.trim();
        if (!t) push('error', 'text_empty', `${who}: escreva a mensagem.`, node.id);
        if (t.length > LIMITS.textMax) push('error', 'text_long', `${who}: máximo de ${LIMITS.textMax} caracteres.`, node.id);
        break;
      }
      case 'audio': {
        if (!node.data.mediaUrl && !node.data.mediaId) push('error', 'audio_missing', `${who}: envie um arquivo de áudio.`, node.id);
        const file = (node.data.fileName || node.data.mediaUrl || '').toLowerCase();
        if (node.data.voice && file && !file.endsWith('.ogg')) {
          push('warning', 'voice_not_ogg', `${who}: nota de voz precisa ser .ogg (OPUS). Outros formatos chegam como arquivo de áudio.`, node.id);
        }
        break;
      }
      case 'delay': {
        const s = node.data.seconds;
        if (!Number.isFinite(s) || s < LIMITS.delayMinSeconds || s > LIMITS.delayMaxSeconds) {
          push('error', 'delay_range', `${who}: use entre 1 segundo e 30 dias.`, node.id);
        }
        break;
      }
      case 'buttons': {
        const b = node.data.buttons;
        if (!node.data.text.trim()) push('error', 'buttons_text', `${who}: escreva a pergunta que acompanha os botões.`, node.id);
        if (node.data.text.length > LIMITS.interactiveBodyMax) push('error', 'buttons_text_long', `${who}: máximo de ${LIMITS.interactiveBodyMax} caracteres no texto.`, node.id);
        if (b.length < 1 || b.length > LIMITS.replyButtonsMax) push('error', 'buttons_count', `${who}: use de 1 a ${LIMITS.replyButtonsMax} botões (limite do WhatsApp).`, node.id);
        checkButtons(b, LIMITS.replyButtonTitleMax, who, node.id, push);
        break;
      }
      case 'template': {
        if (!node.data.templateName) push('error', 'template_missing', `${who}: escolha um modelo aprovado.`, node.id);
        if (node.data.buttons.length > LIMITS.templateQuickRepliesMax) push('error', 'template_buttons', `${who}: modelos aceitam até ${LIMITS.templateQuickRepliesMax} respostas rápidas.`, node.id);
        checkButtons(node.data.buttons, LIMITS.templateButtonTextMax, who, node.id, push);
        if (node.data.templateName && node.data.category === 'MARKETING' && !node.data.buttons.some((b) => b.optOut)) {
          push('error', 'marketing_optout_button', `${who}: modelo de marketing precisa de um botão de saída (ex.: "Parar promoções") marcado como "sair".`, node.id);
        }
        if (node.data.category === 'MARKETING' && !node.data.buttons.some((x) => x.optOut)) {
          push('warning', 'marketing_no_optout', `${who}: modelo de marketing sem botão de saída. Inclua um "Parar promoções" para proteger a qualidade do número.`, node.id);
        }
        break;
      }
    }
  }

  // ---- alcance + janela de 24h --------------------------------------------
  if (start) {
    const reached = analyseWindow(graph, start.id, (node, why) => {
      if (why === 'closed') {
        push('error', 'outside_window',
          `${name(node)} seria enviada fora da janela de 24h. Antes dela, o contato precisa responder (botão) — ou troque por um modelo aprovado.`, node.id);
      } else {
        push('warning', 'window_expired',
          `${name(node)} vem depois de mais de 24h da última resposta; a janela pode ter fechado. Use um modelo aprovado.`, node.id);
      }
    });
    for (const node of graph.nodes) {
      if (node.type !== 'start' && !reached.has(node.id)) {
        push('warning', 'unreachable', `${name(node)} não está ligada ao fluxo e nunca será executada.`, node.id);
      }
    }
  }

  // ---- botões sem destino --------------------------------------------------
  for (const node of graph.nodes) {
    if (node.type !== 'buttons' && node.type !== 'template') continue;
    for (const b of node.data.buttons) {
      if (b.optOut) continue;
      if (!graph.edges.some((e) => e.source === node.id && e.sourceHandle === `btn:${b.key}`)) {
        push('warning', 'button_unconnected', `${name(node)}: o botão "${b.label}" não leva a nenhuma etapa; o fluxo termina quando clicarem.`, node.id);
      }
    }
  }

  // ---- laço infinito -------------------------------------------------------
  const loopNode = findInstantLoop(graph);
  if (loopNode) {
    push('error', 'instant_loop', `${name(getNode(graph, loopNode)!)} faz parte de um laço sem espera. Inclua um Aguardar ou Botões no caminho.`, loopNode);
  }

  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return { issues: dedupe(issues), canPublish: !issues.some((i) => i.severity === 'error') };
}

function checkButtons(
  buttons: { key: string; label: string }[], max: number, who: string, nodeId: string,
  push: (s: FlowIssue['severity'], c: string, m: string, n?: string) => void,
) {
  const seen = new Set<string>();
  for (const b of buttons) {
    const label = b.label.trim();
    if (!label) push('error', 'button_empty', `${who}: há um botão sem texto.`, nodeId);
    if (label.length > max) push('error', 'button_long', `${who}: "${label}" passa de ${max} caracteres.`, nodeId);
    const k = label.toLowerCase();
    if (seen.has(k)) push('error', 'button_dup', `${who}: dois botões com o texto "${label}".`, nodeId);
    seen.add(k);
  }
}

/**
 * Percorre o grafo levando o estado da janela de atendimento:
 *  - começa FECHADA (disparo é iniciado pela empresa);
 *  - abre (zera o relógio) ao passar por uma saída de botão = contato respondeu;
 *  - "sem resposta" (timeout) não abre;
 *  - Aguardar soma tempo; passou de 24h, fecha.
 */
function analyseWindow(
  graph: FlowGraph, startId: string,
  report: (node: FlowNode, why: 'closed' | 'expired') => void,
): Set<string> {
  type State = { id: string; open: boolean; since: number; viaReply: boolean };
  const best = new Map<string, number>();       // `${id}|${open}` -> menor "since" visto
  const reported = new Set<string>();
  const reached = new Set<string>();
  const stack: State[] = [{ id: startId, open: false, since: 0, viaReply: false }];

  while (stack.length) {
    const s = stack.pop()!;
    const node = getNode(graph, s.id);
    if (!node) continue;
    const key = `${s.id}|${s.open}`;
    const prev = best.get(key);
    if (prev !== undefined && prev <= s.since) continue;
    best.set(key, s.since);
    reached.add(s.id);

    if (SESSION_TYPES.has(node.type) && !reported.has(node.id)) {
      if (!s.open) {
        reported.add(node.id);
        report(node, s.viaReply ? 'expired' : 'closed');
      }
    }

    let since = s.since;
    let open = s.open;
    if (node.type === 'delay') {
      since += node.data.seconds;
      if (open && since >= LIMITS.serviceWindowSeconds) open = false;
    }

    for (const e of graph.edges.filter((x) => x.source === node.id)) {
      if (e.sourceHandle.startsWith('btn:')) {
        stack.push({ id: e.target, open: true, since: 0, viaReply: true });
      } else {
        stack.push({ id: e.target, open, since, viaReply: s.viaReply });
      }
    }
  }
  return reached;
}

/** Ciclo formado só por etapas que não esperam nada (envio instantâneo). */
function findInstantLoop(graph: FlowGraph): string | null {
  const instant = (n: FlowNode) =>
    n.type === 'start' || n.type === 'text' || n.type === 'audio' ||
    (n.type === 'template' && n.data.buttons.length === 0);
  const color = new Map<string, 0 | 1 | 2>();
  const visit = (id: string): string | null => {
    color.set(id, 1);
    for (const e of graph.edges.filter((x) => x.source === id)) {
      const t = getNode(graph, e.target);
      if (!t || !instant(t)) continue;
      const c = color.get(t.id) ?? 0;
      if (c === 1) return t.id;
      if (c === 0) {
        const r = visit(t.id);
        if (r) return r;
      }
    }
    color.set(id, 2);
    return null;
  };
  for (const n of graph.nodes) {
    if (instant(n) && (color.get(n.id) ?? 0) === 0) {
      const r = visit(n.id);
      if (r) return r;
    }
  }
  return null;
}

function dedupe(issues: FlowIssue[]): FlowIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.code}|${i.nodeId ?? ''}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
