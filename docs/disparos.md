# Disparos & Fluxos

Módulo do admin para **fluxos de automação** (editor visual) e **campanhas** sobre a WhatsApp Cloud API oficial.
Hoje roda em **simulação persistida no Neon**: tudo é gravado nas tabelas reais, nada sai para a Meta, e os status
(enviada/entregue/lida/falha) e respostas chegam como webhooks simulados **no formato da Cloud API**, pelo mesmo
caminho que os reais vão percorrer.

## Telas

| Rota | O que faz |
|---|---|
| `/campanhas` | Indicadores (enviadas, entregues, lidas, no fluxo, opt-outs) e lista com % concluído |
| `/campanhas/nova` | Público por tag com prévia: quem recebe (opt-in), **sem opt-in**, blacklist, inválidos, duplicados; número + limite 24 h do portfólio; fluxo publicado; velocidade; agora/agendar/rascunho |
| `/campanhas/[id]` | % concluído, enviadas/entregues/lidas/em andamento/falhas/blacklist, funil por etapa, fluxo ao vivo, destinatários, conversa (com resposta simulada) |
| `/fluxos`, `/fluxos/[id]` | Editor: Modelo aprovado, Texto, Áudio, Aguardar, Botões, Blacklist, Fim; ETAPA 1..N; validação com as regras da Meta; versões publicadas imutáveis; **Testar** roda o motor real |
| `/contatos` | Contatos com consentimento, importação com origem do opt-in, blacklist |

## Regras (por design)

- **Só recebe quem tem opt-in registrado** (`lead.consent = opted_in`). Sem consentimento → `skipped_no_consent`. Disparo não solicitado não existe no sistema.
- **Opt-out vence sempre**: `SAIR`, `PARAR`, "não quero mais receber"…, botão marcado como saída, etapa Blacklist ou erro 131050 da Meta → `consent_event` (log imutável) + `lead.consent = opted_out` + todas as execuções do número encerradas. Checado na criação da campanha **e** no envio.
- Importar contatos exige origem + descrição do consentimento e **nunca** reativa quem está em opt-out. Voltar a receber só registrando o pedido do titular (novo opt-in no log; o opt-out continua lá).
- Primeira etapa precisa ser modelo aprovado (janela de 24 h); o editor não publica fluxo que viole isso.
- Limite diário é do portfólio (BM): a campanha segura a fila e retoma sozinha. Nada contorna limite, qualidade ou bloqueio.

## Código

```
apps/admin/lib/disparos/
  domain/    grafo, motor puro advance(), validação, opt-out, presets, operações do editor
  whatsapp/  provider Meta (Graph v26.0), provider simulado, parser/assinatura de webhook
  server/    DisparosService · DisparosRepo (contrato) · PrismaRepo (Neon) · MemoryRepo (testes)
             app-container (escolhe o modo) · prisma-sim (fila de webhooks + trava do worker) · http
  tests/     motor, validação, opt-out, service, webhooks Meta, editor  (npm test -w @eco/admin)
apps/admin/components/disparos/   telas (client), tokens do DS
apps/admin/app/{campanhas,fluxos,contatos}/   páginas
apps/admin/app/api/disparos/[...path]/        API do módulo
apps/admin/app/api/webhooks/whatsapp/         webhook da Meta (GET verificação, POST eventos com HMAC)
```

Tabelas (todas novas, em `apps/admin/prisma/schema.prisma`, nenhuma existente alterada): `lead`, `consent_event`,
`flow`, `flow_version`, `campaign`, `campaign_recipient`, `flow_run`, `flow_run_step`, `message`,
`message_status_event`, `service_window`, `webhook_event`, `worker_lease`. Números/templates/BMs vêm das tabelas de
contingência. `clienteId` é o tenant (null = operador, enquanto não há auth/RLS).

## Worker

O envio anda por "ticks" (`DisparosService.tick()`): dispara a fila respeitando velocidade e limite, acorda esperas e
timeouts, entrega webhooks simulados. Na simulação, as próprias leituras da API disparam um tick (trava em
`worker_lease`, um por vez entre instâncias). No modo Meta, chamar `POST /api/disparos/worker/tick` a cada ~10–30 s
com `Authorization: Bearer $WORKER_SECRET` (a Vercel Hobby só tem cron diário: usar um cron externo).

## Ligar na Meta

1. `WHATSAPP_PROVIDER=meta` + `META_SYSTEM_USER_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`.
2. Em cada número, preencher `metaPhoneId` (phone_number_id) em `/numeros`.
3. App da Meta: webhook `https://<domínio>/api/webhooks/whatsapp`, campo `messages`.
4. Cron externo no worker (acima).
5. Pendências do doc 04: token por WABA cifrado (`credencial_meta`), sessão/tenant real, RLS.
