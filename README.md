# API Hub (placeholder) — Ecossistema API

CRM/SaaS multi-tenant para disparos via WhatsApp Cloud API oficial. Painel admin (operador) +
portal do cliente (white-label). Respeita política da Meta e LGPD: opt-out honrado por design.

## Estrutura

```
apps/admin/            Next.js (App Router) — painel admin
  app/                 rotas; page.tsx = Visão geral
  components/overview/ blocos do dashboard (só compõem, sem regra de negócio)
  components/shell/    moldura e navegação
  lib/                 formatação pt-BR e rótulos dos enums
packages/core/         @eco/core — compartilhado com o futuro portal do cliente
  src/domain/          tipos = schema futuro do Postgres
  src/data/            interface DataSource + implementação mock
  src/queries/         read models por tela (getAdminOverview)
  src/rules/           regras puras (alertas)
docs/data-model.md     mapeamento tipos → tabelas
```

Fluxo de uma tela: `page.tsx` → `getAdminOverview(getDataSource())` → objeto serializável → componentes.
Ligar o banco = implementar `PostgresDataSource` e definir `DATA_SOURCE=postgres`. Nenhuma tela muda.

## Rodar

```bash
nvm use            # Node 20.9+
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run mock:overview   # imprime o read model do dashboard no terminal
```

## Estilo

Tokens em `apps/admin/app/globals.css` (dark + violeta). CSS Modules para componentes;
Tailwind v4 disponível com os mesmos tokens (`bg-surface`, `text-ink-2`, `border-hairline`, `text-accent`).
