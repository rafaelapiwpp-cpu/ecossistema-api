# Modelo de dados

Os tipos em `packages/core/src/domain/` **são** o schema. Cada `interface` vira uma tabela no Postgres
(Prisma), cada union de strings vira um `enum` ou `text` com `CHECK`. As telas nunca leem tabelas:
leem a interface `DataSource` (`packages/core/src/data/datasource.ts`), hoje implementada em memória
(`data/mock`) e depois por uma `PostgresDataSource` com a mesma assinatura.

```mermaid
erDiagram
  PLAN ||--o{ TENANT : assina
  TENANT ||--o{ TENANT_MEMBERSHIP : tem
  USER ||--o{ TENANT_MEMBERSHIP : participa
  TENANT ||--o{ BUSINESS_MANAGER : conecta
  BUSINESS_MANAGER ||--o{ WABA : contem
  WABA ||--o{ PHONE_NUMBER : contem
  WABA ||--o{ MESSAGE_TEMPLATE : aprova
  TENANT ||--o{ CONTACT_LIST : tem
  TENANT ||--o{ LEAD : tem
  LEAD ||--o{ CONSENT_EVENT : "log imutavel"
  TENANT ||--o{ CAMPAIGN : dispara
  CAMPAIGN }o--|| MESSAGE_TEMPLATE : usa
  CAMPAIGN }o--|| PHONE_NUMBER : "envia por"
  CAMPAIGN ||--o{ MESSAGE : gera
  PHONE_NUMBER ||--o{ HOURLY_NUMBER_STATS : rollup
  PHONE_NUMBER ||--o{ DAILY_NUMBER_STATS : rollup
  TENANT ||--o{ ALERT : recebe
  USER ||--o{ AUDIT_LOG : "acao do admin"
```

## Entidades → tabelas

| Tipo TS (arquivo) | Tabela | Notas |
|---|---|---|
| `Plan` (tenant.ts) | `plans` | Limites mensais, números, assentos, contatos. |
| `Tenant` (tenant.ts) | `tenants` | `limitsOverride` em `jsonb`. `sendingEnabled` = kill switch do admin. Branding white-label embutido. |
| `User`, `TenantMembership` (tenant.ts) | `users`, `tenant_memberships` | `platformRole` (superadmin/support) separado do papel no tenant. |
| `BusinessManager` (meta.ts) | `business_managers` | Limite de 24 h (`messagingLimitTier`) mora aqui: desde out/2025 é do portfólio, compartilhado entre os números. |
| `WhatsAppBusinessAccount` (meta.ts) | `wabas` | `webhookSubscribed` — sem isso não recebemos status nem opt-outs. |
| `PhoneNumber` (meta.ts) | `phone_numbers` | Enums em CAIXA ALTA espelham a Graph API (gravamos o que a Meta devolve). |
| `MessageTemplate` (template.ts) | `message_templates` | `content` em `jsonb`. MARKETING exige botão de descadastro (regra nossa). |
| `Campaign` (campaign.ts) | `campaigns` | `stats` é cache dos workers; a verdade está em `messages`. Guardrails pausam sozinhos. |
| `Lead`, `ContactList` (lead.ts) | `leads`, `contact_lists`, `contact_list_members` | `UNIQUE (tenant_id, phone)`. Dois eixos: `stage` (funil) e `consent` (LGPD). |
| `ConsentEvent` (lead.ts) | `consent_events` | **Append-only.** `Lead.consent` é projeção do último evento. |
| `Message` (message.ts) | `messages` | Maior tabela: particionar por mês, `UNIQUE (wamid)`, índice `(tenant_id, created_at)`. |
| `HourlyNumberStats`, `DailyNumberStats` (metrics.ts) | `hourly_number_stats`, `daily_number_stats` | Rollups. Dashboards leem daqui, nunca `COUNT(*)` em `messages`. |
| `Alert` (infra.ts) | `alerts` | Abertos/resolvidos por `deriveAlerts()` (rules/alerts.ts), as mesmas regras no mock e no worker. |
| `AuditLogEntry` (infra.ts) | `audit_log` | Append-only. Toda ação do admin que muda estado de cliente. |
| `ServiceHealth` (infra.ts) | — | Vem do monitoramento, não do banco. |

## Do doc de arquitetura para o código

O doc do projeto lista um modelo mínimo em português. O código usa nomes em inglês (e os valores
da Meta onde existem) para que a sincronização com a Graph API não precise traduzir. Equivalências:

| Doc | Código |
|---|---|
| Tenant `nome, slug, plano, status` | `Tenant.tradeName, slug, planId, status` |
| User `papel ADMIN \| CLIENTE` | `User.platformRole` + `TenantMembership.role` |
| BM `status ativa \| restrita \| banida` | `BusinessManager.verificationStatus` + `connectionStatus` (+ status dos números) |
| Numero `status`, `qualidade alta\|media\|baixa` | `PhoneNumber.status` (Graph API), `qualityRating GREEN\|YELLOW\|RED` |
| Numero `tier` | `BusinessManager.messagingLimitTier` (o limite é do portfólio) |
| Template `aprovado\|pendente\|rejeitado` | `MessageTemplate.status` (+ `PAUSED`, `DISABLED`, `IN_APPEAL`) |
| Campanha `rascunho … pausado` | `Campaign.status` + `pauseReason` |
| Lead `novo\|respondido\|interessado\|invalido` | `Lead.stage` |
| Lead `opt_out` | `Lead.consent.status = "opted_out"` (eixo separado, vence o estágio) |
| Fluxo | ainda não modelado — fica com o chat "Disparos & Fluxos" |

Fora do modelo de propósito: status "aquecendo" de BM/número. Rampa de volume, quando existir, é
um limite que **nós** impomos (throttle da campanha), não uma técnica para mudar como a Meta
enxerga o número.

## Multi-tenancy

Toda entidade de cliente tem `tenantId`. Admin passa filtro opcional; o portal recebe o `tenantId`
da sessão. Na `PostgresDataSource`, Row Level Security por `tenant_id` é a segunda barreira.
IDs têm marca de tipo (`TenantId`, `PhoneNumberId`…) e prefixo (`tnt_`, `pn_`…), gerados como ULID.
