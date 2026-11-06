# Ecossistema API — guia rápido para o Claude

Plataforma para a API oficial do WhatsApp (Cloud API da Meta): atendimento, disparos, fluxos, leads, contatos,
gerenciador de templates, conexões por BM e portal white-label por empresa (`/{slug}`). Quem pede é o Rafa (dono, não
técnico): **falar sempre em português do Brasil**, respostas curtas, entregar pronto e testado.

Nasceu do código do "HUB API" (06/11/2026), sem histórico, sem dados de clientes e sem vínculo com o repositório antigo.

## Stack e produção
- Next.js 15 (App Router) + React 19 + TypeScript; Postgres pelo cliente `postgres` (`lib/db.ts`: `query`, `db().unsafe`).
- Repositório: `rafaelapiwpp-cpu/ecossistema-api` (**público**: nada de segredo, hash de senha ou dado pessoal no código).
- Produção: Vercel, projeto `ecossistema-api` (Root Directory = raiz do repositório), banco Neon. `main` = produção.
- Configuração fica na tabela `settings` (não em variáveis), exceto `POSTGRES_URL`/`DATABASE_URL`, `HUB_MAIL_*` e
  `SECRETS_KEY` (chave que cifra no banco os tokens da Meta, as chaves dos apps e a senha do e-mail — `lib/secrets.ts`).
  Gravou segredo novo? Passe por `seal()`; leu direto do banco? `unseal()` (ou use `getSettings`/`lib/connections`).

## Mapa
- `lib/schema.ts` — esquema e migração automática (`migrateOnce`). Mudança de banco = **acrescentar** comandos
  idempotentes no fim da lista `SCHEMA` e subir `SCHEMA_VERSION`.
- `lib/chat.ts` — webhook → contatos/conversas/mensagens, envio, mídia na Meta, ecos do celular (coexistência).
- `lib/media-cache.ts` — mídia guardada no banco (`media_files`), servida por `app/api/media/[id]`.
- `lib/changes.ts`, `lib/pulse.ts`, `app/api/pulse` — tempo real: gatilhos gravam em `hub_changes`; a tela consulta
  a cada 1,5 s (20 s com a aba escondida).
- `lib/client-cache.ts` — cache das telas no navegador. `lib/access.ts` — escopo (o que cada usuário vê).
- `lib/connections.ts` (token por BM), `lib/sync.ts` (sync diário), `lib/campaigns.ts`, `lib/flows.ts`.
- `components/Inbox.tsx` — Atendimento (grande: ler por trechos). `components/PortalHome.tsx` — Início do portal.
- `app/(painel)/*` — painel interno; `app/[slug]/(portal)/*` — portal da empresa; `app/api/*` — rotas.
- `lib/brand.ts` — nome e dados da empresa operadora (páginas públicas). `components/Wordmark.tsx` — logo provisório.

## Papéis e escopo
- Master > Administrador > Gestor > Atendente; **Cliente** só no portal da própria empresa (números dela).
- Toda rota que o cliente usa filtra por número/empresa (`getScope`, `phoneSql`, `companySql`, `canSeePhone`).

## Regras de ouro
- Não digitar tokens, senhas ou cartão; não conceder acessos na Meta (parceria, ativos, tokens); não aceitar termos.
- Não mexer em dados reais de produção (só leitura). Mudar campos/configuração de webhook na Meta: pedir o OK do Rafa.
- Respeitar as regras da Meta e a LGPD: opt-out vale sempre; nada que sirva para burlar a detecção da Meta
  (por isso **não existe** criação de templates em massa com variações de texto).

## Publicar
- Ramo novo a partir da `main` → commit em português (o que muda para quem usa) → push → CI verde (`.github/workflows/ci.yml`)
  → merge na `main` (a Vercel publica sozinha). Antes de começar, conferir se a `main` andou.

## Testar
- `npx tsc --noEmit -p .` e `npx next build` antes de publicar.
- No PC do Rafa: `Downloads\HUB API\INICIAR-ECOSSISTEMA-LOCAL.cmd` baixa/atualiza este repositório e sobe Postgres portátil
  + banco de teste fictício + Meta simulada + o sistema em http://localhost:3123 (login de teste `master` / `master-local-123`).

## Economia de tokens
- Uma tarefa por sessão; começar por este arquivo, sem reler o projeto inteiro.
- Ler só trechos (grep, faixas de linhas), nunca arquivo grande inteiro; prints só quando o visual importa.
- Mudanças pequenas e certeiras; arquivo novo com até ~350 linhas.
