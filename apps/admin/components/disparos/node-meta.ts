import type { NodeType } from '@/lib/disparos/domain/flow-types';
import type { IconName } from './icons';

export const NODE_META: Record<NodeType, { icon: IconName; color: string; hint: string }> = {
  start: { icon: 'bolt', color: 'var(--chart-7)', hint: 'Onde o fluxo começa quando a campanha dispara para o contato.' },
  template: { icon: 'template', color: 'var(--chart-7)', hint: 'Modelo aprovado pela Meta. Única mensagem permitida fora da janela de 24h — use como primeira etapa.' },
  text: { icon: 'text', color: 'var(--chart-1)', hint: 'Mensagem de texto livre. Só sai com a janela de 24h aberta (o contato respondeu).' },
  audio: { icon: 'mic', color: 'var(--chart-5)', hint: 'Áudio ou nota de voz (.ogg OPUS). Só sai com a janela de 24h aberta.' },
  delay: { icon: 'clock', color: 'var(--chart-4)', hint: 'Espera X segundos/minutos/horas antes de seguir.' },
  buttons: { icon: 'buttons', color: 'var(--chart-3)', hint: 'Pergunta com até 3 botões (ex.: Confirmar / Cancelar). Cada botão é uma saída.' },
  optout: { icon: 'ban', color: 'var(--danger)', hint: 'Coloca o contato na blacklist e encerra. Ele não recebe mais nenhum disparo.' },
  end: { icon: 'flag', color: 'var(--text-fg-secondary)', hint: 'Encerra o fluxo para o contato.' },
};

/** Tipos que aparecem na paleta do editor, na ordem. */
export const PALETTE: NodeType[] = ['template', 'text', 'audio', 'delay', 'buttons', 'optout', 'end'];
