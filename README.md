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
packages/tokens/       @eco/tokens — tokens.css + status-map.ts do design system (cópia de design-system/)
packages/core/         @eco/core — compartilhado com o futuro portal do cliente
  src/domain/          tipos = schema futuro do Postgres
  src/data/            interface DataSource + implementação mock
  src/queries/         read models por tela (getAdminOverview)
  src/rules/           regras puras (alertas)
docs/data-model.md     mapeamento tipos → tabelas
```

Fluxo de uma tela: `page.tsx` → `getAdminOverview(getDataSource())` → objeto serializável → componentes.
Fonte de dados: Postgres (Neon, schema em `apps/admin/prisma`) quando há `DATABASE_URL`, mock sem banco.
Força com `DATA_SOURCE=postgres|mock`. Detalhes em `docs/data-model.md`.

## Rodar

```bash
nvm use            # Node 20.9+
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm test           # testes de todos os workspaces
npm run mock:overview   # imprime o read model do dashboard no terminal
```

## Estilo

Design system **Ecossistema UI** (dono: chat UX & Design System). `app/globals.css` é a integração
Tailwind v4 dele: utilitários semânticos `bg-surface`, `text-fg-muted`, `border-line`, `bg-brand`…
Fontes Geist via `next/font`. `<html data-surface="admin" data-density="compact">`.

A Visão geral ainda usa CSS Modules escritos antes do DS; uma camada-ponte no fim do `globals.css`
aponta os nomes antigos para os tokens semânticos. Telas novas usam os utilitários do DS direto.
