// Códigos de erro que a Meta devolve no envio, explicados em português e com o que fazer.
// Usado na conversa (Atendimento) e na tela Falhas. O texto original da Meta continua na dica (title).
export const META_ERROR_HINT: Record<number, string> = {
  131042: "Pagamento: a conta do WhatsApp está sem forma de pagamento ativa na Meta (ou acabou de ser adicionada — leva alguns minutos). Confira em Cobrança e pagamentos → Contas de mensagens e envie de novo.",
  131026: "Número sem WhatsApp, versão antiga do app ou não aceitou os termos.",
  131047: "Passaram 24h desde a última mensagem do cliente: só template pode ser enviado.",
  131049: "A Meta limitou marketing para esse contato (muitas mensagens recebidas). Evite reenviar logo em seguida.",
  131050: "O contato pediu para parar de receber marketing desta empresa.",
  131048: "Limite de spam atingido pelo número; reduza o volume e revise a qualidade.",
  131056: "Muitas mensagens para o mesmo contato em pouco tempo.",
  131031: "A conta do WhatsApp está bloqueada pela Meta (política ou verificação). Veja os avisos no Gerenciador do WhatsApp.",
  131053: "A Meta não aceitou a mídia (formato ou tamanho).",
  130429: "Muitas mensagens por segundo para a Meta; diminua a velocidade do disparo.",
  132000: "Quantidade de variáveis diferente da aprovada no template.",
  132001: "Template não existe ou idioma diferente do aprovado.",
  132015: "Template pausado pela Meta por baixa qualidade.",
  132016: "Template desativado pela Meta.",
  133010: "Número da empresa não está registrado na API.",
  130472: "Contato em experimento da Meta; não é cobrado.",
};

export const metaErrorHint = (code: number | null | undefined) => (code ? META_ERROR_HINT[Number(code)] : undefined);
