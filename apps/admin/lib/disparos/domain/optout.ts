/**
 * Detecção de pedido de saída em mensagens recebidas.
 *
 * Regras:
 *  - palavra isolada (a mensagem inteira) para termos curtos: "SAIR", "Parar!", "stop";
 *  - frase contida para pedidos explícitos: "não quero mais receber", "me tira da lista".
 *  - "cancelar" sozinho NÃO é opt-out: é resposta comum de botão (cancelar consulta).
 *
 * Cada tenant pode acrescentar termos (campo extra), nunca remover os padrão.
 */

const EXACT = new Set([
  'sair', 'parar', 'pare', 'stop', 'descadastrar', 'descadastre', 'descadastra',
  'remover', 'unsubscribe', 'cancelar inscricao', 'sair da lista', 'nao quero receber',
]);

const PHRASES = [
  'nao quero mais receber', 'nao quero receber', 'parar de receber', 'pare de mandar',
  'para de mandar', 'pare de enviar', 'para de enviar', 'nao me mande mais', 'nao mande mais',
  'me tira da lista', 'me tire da lista', 'me remove da lista', 'me remova da lista',
  'remover meu numero', 'remova meu numero', 'sair da lista', 'nao quero mais mensagens',
];

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isOptOutText(text: string | undefined, extra: string[] = []): boolean {
  if (!text) return false;
  const t = normalizeText(text);
  if (!t) return false;
  if (EXACT.has(t)) return true;
  if (extra.some((k) => normalizeText(k) === t)) return true;
  return PHRASES.some((p) => t.includes(p));
}
