import type { FlowGraph } from './flow-types';

/** Fluxo vazio: só o Início, pronto para receber a Etapa 1. */
export function blankGraph(): FlowGraph {
  return { nodes: [{ id: 'start', type: 'start', position: { x: 80, y: 220 }, data: { trigger: 'campaign' } }], edges: [] };
}

/** Confirmação de consulta: usa todos os tipos de etapa. */
export function confirmationGraph(): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 40, y: 260 }, data: { trigger: 'campaign' } },
      {
        id: 'tpl', type: 'template', position: { x: 280, y: 170 },
        data: {
          templateName: 'confirmacao_consulta', language: 'pt_BR', category: 'UTILITY',
          bodyPreview: 'Olá {{1}}, sua consulta está marcada para {{2}}. Podemos confirmar?',
          variables: ['{{nome}}', '{{data_consulta}}'],
          buttons: [
            { key: 'confirmar', label: 'Confirmar' },
            { key: 'remarcar', label: 'Remarcar' },
            { key: 'parar', label: 'Parar mensagens', optOut: true },
          ],
          timeoutSeconds: 24 * 3600,
        },
      },
      { id: 'ok', type: 'text', position: { x: 680, y: 30 }, data: { text: 'Perfeito, {{nome}}! Sua consulta está confirmada. Até lá 👋' } },
      { id: 'wait', type: 'delay', position: { x: 1050, y: 50 }, data: { seconds: 30 * 60 } },
      { id: 'aud', type: 'audio', position: { x: 1410, y: 30 }, data: { mediaUrl: 'https://exemplo.com/orientacoes-preparo.ogg', fileName: 'orientacoes-preparo.ogg', voice: true, durationSeconds: 42 } },
      {
        id: 'when', type: 'buttons', position: { x: 680, y: 290 },
        data: {
          text: 'Sem problema! Qual período fica melhor pra você?',
          buttons: [
            { key: 'manha', label: 'Manhã' },
            { key: 'tarde', label: 'Tarde' },
            { key: 'nao', label: 'Não quero mais' },
          ],
          timeoutSeconds: 2 * 3600,
        },
      },
      { id: 'noted', type: 'text', position: { x: 1050, y: 250 }, data: { text: 'Anotado! Nossa equipe vai te chamar com novos horários ainda hoje.' } },
      { id: 'bye', type: 'optout', position: { x: 1050, y: 450 }, data: { confirmationText: 'Tudo certo, {{nome}}. Você não vai mais receber nossas mensagens automáticas.', reason: 'Desistiu ao remarcar' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourceHandle: 'next', target: 'tpl' },
      { id: 'e2', source: 'tpl', sourceHandle: 'btn:confirmar', target: 'ok' },
      { id: 'e3', source: 'ok', sourceHandle: 'next', target: 'wait' },
      { id: 'e4', source: 'wait', sourceHandle: 'next', target: 'aud' },
      { id: 'e5', source: 'tpl', sourceHandle: 'btn:remarcar', target: 'when' },
      { id: 'e6', source: 'when', sourceHandle: 'btn:manha', target: 'noted' },
      { id: 'e7', source: 'when', sourceHandle: 'btn:tarde', target: 'noted' },
      { id: 'e8', source: 'when', sourceHandle: 'btn:nao', target: 'bye' },
    ],
  };
}

export function promoGraph(): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 40, y: 200 }, data: { trigger: 'campaign' } },
      {
        id: 'tpl', type: 'template', position: { x: 280, y: 120 },
        data: {
          templateName: 'promo_novembro', language: 'pt_BR', category: 'MARKETING',
          bodyPreview: 'Oi {{1}}! Em novembro a avaliação de clareamento sai com {{2}} de desconto. Quer saber como funciona?',
          variables: ['{{nome}}', '30%'],
          buttons: [
            { key: 'quero', label: 'Quero saber' },
            { key: 'parar', label: 'Parar promoções', optOut: true },
          ],
          timeoutSeconds: 48 * 3600,
        },
      },
      { id: 'info', type: 'text', position: { x: 680, y: 60 }, data: { text: 'A avaliação leva 30 minutos e já sai com o plano e o valor final. O desconto vale até 30/11.' } },
      { id: 'pause', type: 'delay', position: { x: 1050, y: 80 }, data: { seconds: 20 } },
      {
        id: 'ask', type: 'buttons', position: { x: 1410, y: 30 },
        data: {
          text: 'Quer que a gente reserve um horário pra você?',
          buttons: [{ key: 'agendar', label: 'Agendar' }, { key: 'depois', label: 'Agora não' }],
          timeoutSeconds: 24 * 3600,
        },
      },
      { id: 'book', type: 'text', position: { x: 1780, y: 0 }, data: { text: 'Combinado! Em instantes alguém da recepção te chama por aqui.' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourceHandle: 'next', target: 'tpl' },
      { id: 'e2', source: 'tpl', sourceHandle: 'btn:quero', target: 'info' },
      { id: 'e3', source: 'info', sourceHandle: 'next', target: 'pause' },
      { id: 'e4', source: 'pause', sourceHandle: 'next', target: 'ask' },
      { id: 'e5', source: 'ask', sourceHandle: 'btn:agendar', target: 'book' },
    ],
  };
}

/** Rascunho com um erro de propósito (texto fora da janela) para mostrar a validação. */
export function reactivationDraftGraph(): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 40, y: 160 }, data: { trigger: 'campaign' } },
      { id: 'wait', type: 'delay', position: { x: 280, y: 160 }, data: { seconds: 86400 } },
      { id: 'txt', type: 'text', position: { x: 640, y: 130 }, data: { text: 'Oi {{nome}}, sentimos sua falta! Que tal agendar seu retorno?' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourceHandle: 'next', target: 'wait' },
      { id: 'e2', source: 'wait', sourceHandle: 'next', target: 'txt' },
    ],
  };
}
