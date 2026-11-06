# Ecossistema API

Plataforma para a API Oficial do WhatsApp (Meta Cloud API): atendimento (caixa de entrada), disparos, fluxos
automáticos, leads/funil, contatos, gerenciador de templates, conexões por BM e portal white-label por empresa (`/{slug}`).

## Como funciona

- **Next.js 15** (App Router) + React 19 + TypeScript, hospedado na Vercel. **PostgreSQL** (Neon) via `POSTGRES_URL` ou `DATABASE_URL`.
- Na primeira abertura, a tela `/setup` cria as tabelas, o usuário **Master** e guarda o token do usuário do sistema,
  a chave secreta do app e o ID do portfólio (BM) da Meta, tudo no banco. Com a variável `SECRETS_KEY` definida na Vercel,
  esses segredos ficam **cifrados** no banco (AES-256-GCM, `lib/secrets.ts`); a tela Configurações mostra o estado e gera a chave.
- Banco: `lib/schema.ts` migra sozinho (comandos idempotentes; mudança = acrescentar no fim e subir `SCHEMA_VERSION`).
- `/api/sync` busca os dados na Graph API (cron diário em `vercel.json` ou botão "Sincronizar agora").
- `/api/webhook` recebe as notificações da Meta (assinatura validada com a chave secreta do app).
- `/sobre`, `/privacidade`, `/termos` e `/exclusao-de-dados` são as páginas públicas exigidas no cadastro do app da Meta
  (dados da empresa operadora em `lib/brand.ts`).

## Rodar localmente

```bash
npm install
POSTGRES_URL=postgres://usuario:senha@localhost:5432/painel npm run dev
```

Sem `POSTGRES_URL` o painel abre em modo demonstração com dados fictícios.
