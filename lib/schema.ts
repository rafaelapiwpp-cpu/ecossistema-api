import { db } from "./db";

// Estrutura do banco. Idempotente: pode rodar quantas vezes for preciso.
export const SCHEMA = [
  `create table if not exists settings (
    id integer primary key default 1 check (id = 1),
    password_hash text not null,
    session_secret text not null,
    meta_token text not null,
    meta_app_secret text not null,
    meta_business_id text not null,
    meta_app_id text,
    meta_waba_ids text,
    webhook_verify_token text not null,
    cron_secret text not null,
    graph_version text not null default 'v26.0',
    insights_enabled boolean not null default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  )`,
  `create table if not exists wabas (
    id text primary key, name text, currency text, timezone_id text, ownership text,
    insights boolean, updated_at timestamptz default now()
  )`,
  `create table if not exists phone_numbers (
    id text primary key, waba_id text, display_phone_number text, phone_digits text, verified_name text,
    quality_rating text, messaging_limit text, status text, name_status text, updated_at timestamptz default now()
  )`,
  `create table if not exists templates (
    id text primary key, waba_id text, name text, language text, category text, status text,
    quality_score text, rejected_reason text, updated_at timestamptz default now()
  )`,
  `create table if not exists daily_messages (
    waba_id text not null, phone_digits text not null, day date not null,
    sent integer default 0, delivered integer default 0,
    primary key (waba_id, phone_digits, day)
  )`,
  `create table if not exists daily_costs (
    waba_id text not null, day date not null, pricing_category text not null, pricing_type text not null,
    country text not null, volume integer default 0, cost numeric(14,4) default 0,
    primary key (waba_id, day, pricing_category, pricing_type, country)
  )`,
  `create table if not exists template_daily (
    template_id text not null, waba_id text not null, day date not null,
    sent integer default 0, delivered integer default 0, read integer default 0, clicks integer default 0,
    cost numeric(14,4) default 0, primary key (template_id, day)
  )`,
  `create table if not exists message_events (
    wamid text not null, status text not null, waba_id text, phone_number_id text, recipient text,
    pricing_category text, pricing_type text, billable boolean, error_code integer, error_title text,
    error_details text, ts timestamptz, primary key (wamid, status)
  )`,
  `create index if not exists message_events_ts on message_events (ts desc)`,
  `create index if not exists message_events_status on message_events (status, ts desc)`,
  `create table if not exists webhook_log (
    id bigserial primary key, received_at timestamptz default now(), field text, waba_id text, payload jsonb
  )`,
  `create table if not exists sync_runs (
    id bigserial primary key, started_at timestamptz default now(), finished_at timestamptz, ok boolean, details jsonb
  )`,
  // ---- Fase 1: atendimento, contatos, equipe ----
  `create table if not exists users (
    id serial primary key, name text not null, email text not null unique, password_hash text not null,
    role text not null default 'atendente', department_id integer, active boolean not null default true,
    created_at timestamptz default now(), last_login_at timestamptz
  )`,
  `create table if not exists departments (
    id serial primary key, name text not null unique, color text, created_at timestamptz default now()
  )`,
  `create table if not exists contacts (
    id serial primary key, waba_id text not null, phone text not null, name text, email text,
    fields jsonb not null default '{}'::jsonb, department_id integer,
    opt_out boolean not null default false, opt_out_at timestamptz, source text, notes text,
    last_inbound_at timestamptz, last_outbound_at timestamptz,
    created_at timestamptz default now(), updated_at timestamptz default now(),
    unique (waba_id, phone)
  )`,
  `create index if not exists contacts_name on contacts (lower(name))`,
  `create table if not exists tags (id serial primary key, name text not null unique, color text)`,
  `create table if not exists contact_tags (contact_id integer not null, tag_id integer not null, primary key (contact_id, tag_id))`,
  `create table if not exists lists (
    id serial primary key, waba_id text, name text not null, description text, created_at timestamptz default now()
  )`,
  `create table if not exists list_contacts (
    list_id integer not null, contact_id integer not null, added_at timestamptz default now(), primary key (list_id, contact_id)
  )`,
  `create table if not exists conversations (
    id serial primary key, waba_id text not null, phone_number_id text not null, contact_id integer not null,
    status text not null default 'open', assigned_user_id integer, department_id integer, origin text,
    last_message_at timestamptz, last_inbound_at timestamptz, last_outbound_at timestamptz, last_preview text,
    unread_count integer not null default 0, window_expires_at timestamptz, closed_at timestamptz,
    created_at timestamptz default now(),
    unique (phone_number_id, contact_id)
  )`,
  `create index if not exists conversations_status on conversations (status, last_message_at desc)`,
  `create table if not exists messages (
    id bigserial primary key, conversation_id integer not null, waba_id text, phone_number_id text, contact_id integer,
    wamid text unique, direction text not null, type text not null, body text,
    media_id text, media_mime text, media_filename text, payload jsonb,
    status text, error_code integer, error_title text, pricing_category text, billable boolean,
    sent_by_user_id integer, template_name text, campaign_id integer,
    ts timestamptz not null default now(), created_at timestamptz default now()
  )`,
  `create index if not exists messages_conv on messages (conversation_id, ts)`,
  `create table if not exists quick_replies (
    id serial primary key, title text not null, body text not null, department_id integer, created_at timestamptz default now()
  )`,
  `create table if not exists conversation_notes (
    id serial primary key, conversation_id integer not null, user_id integer, body text not null, created_at timestamptz default now()
  )`,
  `create table if not exists conversation_events (
    id bigserial primary key, conversation_id integer not null, type text not null, user_id integer, data jsonb, created_at timestamptz default now()
  )`,
  `alter table templates add column if not exists components jsonb`,
  `alter table settings add column if not exists schema_version integer not null default 0`,
  `alter table settings add column if not exists optout_keywords text not null default 'SAIR,PARAR,CANCELAR,STOP'`,
  `alter table settings add column if not exists optin_keywords text not null default 'VOLTAR'`,
  `alter table settings add column if not exists optout_reply text not null default 'Tudo bem! Você não receberá mais mensagens nossas. Se mudar de ideia, responda VOLTAR.'`,
  `alter table settings add column if not exists autoclose_days integer not null default 3`,
  // usuário administrador inicial, herdando a senha da equipe definida na primeira configuração
  `insert into users (name, email, password_hash, role)
     select 'Administrador', 'admin', password_hash, 'admin' from settings where id = 1
     and not exists (select 1 from users)`,
  // ---- Fase 2: disparos (campanhas) ----
  `create table if not exists campaigns (
    id serial primary key, name text not null, waba_id text not null, phone_number_id text not null,
    template_id text not null, template_name text not null, template_language text not null, template_category text,
    mapping jsonb not null default '{}'::jsonb, audience jsonb not null default '{}'::jsonb,
    status text not null default 'draft', scheduled_at timestamptz, rate_per_minute integer not null default 120,
    total integer not null default 0, last_error text, lock_until timestamptz,
    created_by integer, created_at timestamptz default now(), started_at timestamptz, finished_at timestamptz, updated_at timestamptz default now()
  )`,
  `create table if not exists campaign_recipients (
    id bigserial primary key, campaign_id integer not null, contact_id integer, phone text not null, name text,
    params jsonb, status text not null default 'pending', wamid text, error_code integer, error_title text,
    conversation_id integer, replied boolean not null default false, pricing_category text, billable boolean,
    attempts integer not null default 0, sent_at timestamptz, updated_at timestamptz default now(),
    unique (campaign_id, phone)
  )`,
  `create index if not exists campaign_recipients_status on campaign_recipients (campaign_id, status)`,
  `create index if not exists campaign_recipients_wamid on campaign_recipients (wamid)`,
  `create index if not exists campaign_recipients_contact on campaign_recipients (contact_id, sent_at desc)`,
  `create index if not exists campaign_recipients_phone on campaign_recipients (phone, sent_at desc)`,
  `create index if not exists messages_campaign on messages (campaign_id) where campaign_id is not null`,
  `delete from list_contacts where not exists (select 1 from contacts c where c.id = list_contacts.contact_id)`,
  `delete from contact_tags where not exists (select 1 from contacts c where c.id = contact_tags.contact_id)`,
  // ---- Fase 2.1: diagnóstico do webhook ----
  `create index if not exists webhook_log_received on webhook_log (received_at desc)`,
  // ---- Fase 3: fluxos (automações de disparo) ----
  `create table if not exists flows (
    id serial primary key, name text not null, waba_id text not null, phone_number_id text not null,
    status text not null default 'draft', graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
    settings jsonb not null default '{}'::jsonb, lock_until timestamptz, last_error text,
    created_by integer, created_at timestamptz default now(), updated_at timestamptz default now()
  )`,
  `create table if not exists flow_runs (
    id bigserial primary key, flow_id integer not null, contact_id integer not null, phone text not null, conversation_id integer,
    node_id text, status text not null default 'queued', vars jsonb not null default '{}'::jsonb,
    next_at timestamptz, wait_node_id text, wait_until timestamptz, last_wamid text, last_error text, is_test boolean not null default false,
    started_at timestamptz, finished_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
    unique (flow_id, contact_id)
  )`,
  `create index if not exists flow_runs_due on flow_runs (flow_id, status, next_at)`,
  `create index if not exists flow_runs_contact on flow_runs (contact_id, status)`,
  `create table if not exists flow_events (
    id bigserial primary key, flow_id integer not null, run_id bigint not null, node_id text not null, type text not null, data jsonb, created_at timestamptz default now()
  )`,
  `create index if not exists flow_events_flow on flow_events (flow_id, node_id, type)`,
  `create index if not exists flow_events_run on flow_events (run_id)`,
  `alter table messages add column if not exists flow_run_id bigint`,
  // ---- Fase 3.1: leads (listas importadas), índices de desempenho ----
  `alter table lists add column if not exists tag_id integer`,
  `alter table lists add column if not exists last_import_at timestamptz`,
  `alter table lists add column if not exists imported integer not null default 0`,
  `create index if not exists list_contacts_contact on list_contacts (contact_id)`,
  `create index if not exists contact_tags_tag on contact_tags (tag_id, contact_id)`,
  `create index if not exists contacts_updated on contacts (updated_at desc)`,
  `create index if not exists contacts_waba_phone on contacts (waba_id, phone)`,
  `create index if not exists conversations_contact on conversations (contact_id)`,
  `create index if not exists conversations_last on conversations (last_message_at desc nulls last)`,
  `create index if not exists messages_template on messages (waba_id, template_name, ts desc) where template_name is not null`,
  `create index if not exists messages_contact on messages (contact_id, ts desc)`,
  // ---- Fase 3.2: templates em massa ----
  `alter table settings add column if not exists meta_business_name text`,
  `create table if not exists template_batches (
    id serial primary key, name text not null, waba_id text not null, phone_number_id text, language text not null, category text not null,
    quantity integer not null, start_at integer not null default 1, pad integer not null default 0,
    base jsonb not null default '{}'::jsonb, status text not null default 'running', last_error text,
    created_by integer, created_at timestamptz default now(), updated_at timestamptz default now()
  )`,
  `create table if not exists template_batch_items (
    id serial primary key, batch_id integer not null, position integer not null, name text not null,
    components jsonb not null, status text not null default 'planned', template_id text, meta_status text, error text,
    attempts integer not null default 0, created_at timestamptz default now(), updated_at timestamptz default now(),
    unique (batch_id, position)
  )`,
  `create index if not exists template_batch_items_batch on template_batch_items (batch_id, status)`,
  `create index if not exists templates_waba_name on templates (waba_id, name, language)`,
  // ---- Fase 3.3: randomizadores nos fluxos (número por execução, contadores por template) ----
  `alter table flow_runs add column if not exists phone_number_id text`,
  `create index if not exists flow_runs_phone on flow_runs (flow_id, phone_number_id)`,
  `create table if not exists flow_split_counts (
    flow_id integer not null, node_id text not null, key text not null, n integer not null default 0, updated_at timestamptz default now(),
    primary key (flow_id, node_id, key)
  )`,
  `create index if not exists flow_events_sent on flow_events (flow_id, type, node_id)`,
  // ---- Fase 4: conexões por BM (cada uma com o seu token) e papel Master ----
  `create table if not exists connections (
    id serial primary key, name text not null, kind text not null default 'whatsapp_cloud',
    business_id text, business_name text, token text not null, app_id text, app_secret text, waba_ids text,
    visibility text not null default 'private', active boolean not null default true,
    status text, last_error text, last_sync_at timestamptz,
    created_by integer, created_at timestamptz default now(), updated_at timestamptz default now()
  )`,
  `alter table wabas add column if not exists connection_id integer`,
  `create index if not exists wabas_connection on wabas (connection_id)`,
  `alter table phone_numbers add column if not exists label text`,
  `alter table users add column if not exists must_change_password boolean not null default false`,
  // (removido: semente do usuário master da instalação antiga — numa instalação nova o master nasce no /setup)
  // a conexão que já existia (token das Configurações) vira a primeira conexão, visível só para o Master
  `insert into connections (name, business_id, business_name, token, waba_ids, visibility, created_by)
     select coalesce(nullif(meta_business_name, ''), 'Minha BM'), nullif(meta_business_id, ''), nullif(meta_business_name, ''), meta_token,
            nullif(meta_waba_ids, ''), 'private', (select min(id) from users where role = 'master')
     from settings where id = 1 and coalesce(schema_version, 0) < 9 and coalesce(meta_token, '') <> '' and not exists (select 1 from connections)`,
  // contas já sincronizadas passam a pertencer a essa conexão privada (nunca a uma de Equipe)
  `update wabas set connection_id = (select min(id) from connections where visibility = 'private')
     where connection_id is null and (select coalesce(schema_version, 0) from settings where id = 1) < 9
       and (select count(*) from connections) = 1 and exists (select 1 from connections where visibility = 'private')`,
  // ---- Fase 5: conexões "de Equipe" criadas a partir de contas compartilhadas com a BM principal (reaproveitam o token dela) ----
  `alter table connections add column if not exists source_connection_id integer`,
  `create index if not exists connections_source on connections (source_connection_id)`,
  // ---- Fase 6: "Esqueci minha senha" (código por e-mail) ----
  // e-mail para onde vai o código de redefinição (o login pode ser um nome, como "master")
  `alter table users add column if not exists recovery_email text`,
  // (removido: e-mail de recuperação fixo da instalação antiga — cada master cadastra o seu em Equipe)
  // envio de e-mail (só o Master edita; variáveis HUB_MAIL_* na Vercel têm prioridade)
  `alter table settings add column if not exists mail_from text`,
  `alter table settings add column if not exists mail_user text`,
  `alter table settings add column if not exists mail_pass text`,
  `alter table settings add column if not exists mail_host text`,
  `alter table settings add column if not exists mail_port integer`,
  `create table if not exists password_resets (
     id serial primary key,
     user_id integer not null references users(id) on delete cascade,
     code_hash text not null,
     expires_at timestamptz not null,
     attempts integer not null default 0,
     used_at timestamptz,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists password_resets_user on password_resets (user_id, created_at desc)`,
  // ---- Fase 7: descrição livre por conexão (BM), para identificar do que se trata na Visão geral ----
  `alter table connections add column if not exists description text`,
  // ---- Fase 8: marcar número (conta) como importante — estrela fixada pelo Master/Admin na Visão geral ----
  `alter table phone_numbers add column if not exists featured boolean not null default false`,
  // ---- Fase 9: portal de clientes (empresas com marca própria, usuários-cliente, números por empresa/usuário, funis) ----
  `create table if not exists companies (
     id serial primary key, name text not null, slug text not null unique,
     primary_color text not null default '#6b3fe4', secondary_color text, logo_url text,
     active boolean not null default true, created_at timestamptz default now(), updated_at timestamptz default now()
   )`,
  `alter table users add column if not exists company_id integer`,
  `create index if not exists users_company on users (company_id)`,
  // números (contas) que a empresa atende; e, dentro deles, os que cada usuário dela atende (vazio = todos da empresa)
  `create table if not exists company_phones (company_id integer not null, phone_number_id text not null, primary key (company_id, phone_number_id))`,
  `create index if not exists company_phones_phone on company_phones (phone_number_id)`,
  `create table if not exists user_phones (user_id integer not null, phone_number_id text not null, primary key (user_id, phone_number_id))`,
  // funis: quadro de etapas por empresa; cada contato ocupa uma etapa por funil
  `create table if not exists pipelines (
     id serial primary key, company_id integer not null, name text not null, position integer not null default 0,
     auto_add boolean not null default true, created_at timestamptz default now()
   )`,
  `create index if not exists pipelines_company on pipelines (company_id, position)`,
  `create table if not exists pipeline_stages (
     id serial primary key, pipeline_id integer not null, name text not null, color text,
     position integer not null default 0, kind text not null default 'open'
   )`,
  `create index if not exists pipeline_stages_pipeline on pipeline_stages (pipeline_id, position)`,
  `create table if not exists user_pipelines (user_id integer not null, pipeline_id integer not null, primary key (user_id, pipeline_id))`,
  `create table if not exists pipeline_cards (
     pipeline_id integer not null, contact_id integer not null, stage_id integer not null, position integer not null default 0,
     value numeric, note text, moved_at timestamptz default now(), created_at timestamptz default now(),
     primary key (pipeline_id, contact_id)
   )`,
  `create index if not exists pipeline_cards_stage on pipeline_cards (stage_id, position)`,
  // departamentos, tags e respostas rápidas podem ser de uma empresa (null = internos da equipe)
  `alter table departments add column if not exists company_id integer`,
  `alter table tags add column if not exists company_id integer`,
  `alter table quick_replies add column if not exists company_id integer`,
  // nomes únicos por empresa (e não mais no sistema inteiro)
  `alter table departments drop constraint if exists departments_name_key`,
  `create unique index if not exists departments_name_company on departments (coalesce(company_id, 0), lower(name))`,
  `alter table tags drop constraint if exists tags_name_key`,
  `create unique index if not exists tags_name_company on tags (coalesce(company_id, 0), lower(name))`,
  // empresa dona da conversa/contato, gravada a partir do número — o filtro do portal é um "where company_id = $1" indexado
  `alter table contacts add column if not exists company_id integer`,
  `alter table conversations add column if not exists company_id integer`,
  `create index if not exists contacts_company on contacts (company_id, updated_at desc)`,
  `create index if not exists conversations_company on conversations (company_id, last_message_at desc)`,
  // ---- Fase 10: portal v2 — automações da empresa (departamento padrão, etiquetas automáticas), slogan e atalhos das respostas rápidas ----
  `alter table companies add column if not exists tagline text`,
  `alter table companies add column if not exists default_department_id integer`,
  `create table if not exists company_auto_tags (company_id integer not null, tag_id integer not null, primary key (company_id, tag_id))`,
  `alter table quick_replies add column if not exists shortcut text`,
  // ---- v16: velocidade — mídia guardada no HUB, registro de mudanças (tempo real), índices por número/data, foto de perfil ----
  // mídia baixada da Meta assim que a mensagem chega (a URL da Meta expira e a mídia some depois de ~30 dias)
  `create table if not exists media_files (
    media_id text primary key, mime text, size integer, width integer, height integer, bytes bytea not null,
    source text, created_at timestamptz default now()
  )`,
  `create index if not exists messages_media on messages (media_id) where media_id is not null`,
  `create index if not exists messages_phone_ts on messages (phone_number_id, ts desc)`,
  `create index if not exists conversations_phone_last on conversations (phone_number_id, last_message_at desc nulls last)`,
  `create index if not exists conversations_waba_last on conversations (waba_id, last_message_at desc nulls last)`,
  `alter table phone_numbers add column if not exists profile_picture_url text`,
  `alter table phone_numbers add column if not exists profile_picture_at timestamptz`,
  // registro de mudanças: cada mensagem nova/alterada e cada mudança de conversa vira uma linha; as telas esperam por elas (/api/pulse)
  `create table if not exists hub_changes (
    id bigserial primary key, at timestamptz not null default clock_timestamp(),
    conversation_id integer, phone_number_id text, waba_id text, kind text not null
  )`,
  `create index if not exists hub_changes_phone on hub_changes (phone_number_id, id)`,
  `create index if not exists hub_changes_waba on hub_changes (waba_id, id)`,
  `create index if not exists hub_changes_at on hub_changes (at)`,
  `create or replace function hub_note_message() returns trigger language plpgsql as $$
  begin
    if tg_op = 'INSERT' then
      insert into hub_changes (conversation_id, phone_number_id, waba_id, kind) values (new.conversation_id, new.phone_number_id, new.waba_id, 'msg');
    elsif new.type is distinct from old.type or new.body is distinct from old.body or new.media_id is distinct from old.media_id then
      insert into hub_changes (conversation_id, phone_number_id, waba_id, kind) values (new.conversation_id, new.phone_number_id, new.waba_id, 'msg');
    elsif new.status is distinct from old.status or new.error_code is distinct from old.error_code then
      insert into hub_changes (conversation_id, phone_number_id, waba_id, kind) values (new.conversation_id, new.phone_number_id, new.waba_id, 'status');
    end if;
    return null;
  end $$`,
  `create or replace trigger hub_messages_changes after insert or update on messages for each row execute function hub_note_message()`,
  `create or replace function hub_note_conversation() returns trigger language plpgsql as $$
  begin
    if tg_op = 'INSERT' or new.status is distinct from old.status or new.assigned_user_id is distinct from old.assigned_user_id
       or new.department_id is distinct from old.department_id or new.unread_count is distinct from old.unread_count
       or new.last_message_at is distinct from old.last_message_at or new.last_preview is distinct from old.last_preview
       or new.window_expires_at is distinct from old.window_expires_at or new.company_id is distinct from old.company_id then
      insert into hub_changes (conversation_id, phone_number_id, waba_id, kind) values (new.id, new.phone_number_id, new.waba_id, 'conv');
    end if;
    return null;
  end $$`,
  `create or replace trigger hub_conversations_changes after insert or update on conversations for each row execute function hub_note_conversation()`,
  // nome/opt-out do contato e etiquetas aparecem na lista: avisam as conversas do contato
  `create or replace function hub_note_contact() returns trigger language plpgsql as $$
  declare cid integer;
  begin
    if tg_table_name = 'contacts' then cid := new.id;
    elsif tg_op = 'DELETE' then cid := old.contact_id;
    else cid := new.contact_id; end if;
    insert into hub_changes (conversation_id, phone_number_id, waba_id, kind)
      select c.id, c.phone_number_id, c.waba_id, 'conv' from conversations c where c.contact_id = cid;
    return null;
  end $$`,
  `create or replace trigger hub_contacts_changes after update of name, opt_out on contacts for each row
     when (old.name is distinct from new.name or old.opt_out is distinct from new.opt_out) execute function hub_note_contact()`,
  `create or replace trigger hub_contact_tags_changes after insert or delete on contact_tags for each row execute function hub_note_contact()`,
  // ---- v17: fluxos — teste não bloqueia o disparo, nova tentativa vira nova execução (histórico completo) ----
  // só uma execução real EM ANDAMENTO por contato e fluxo; testes e execuções encerradas ficam no histórico
  `create unique index if not exists flow_runs_active_real on flow_runs (flow_id, contact_id)
     where not is_test and status in ('queued', 'running', 'waiting_reply', 'waiting_time')`,
  `alter table flow_runs drop constraint if exists flow_runs_flow_id_contact_id_key`,
  `create index if not exists messages_flow_run on messages (flow_run_id) where flow_run_id is not null`,
  // fila "Disparo" (robô): conversa cuja última mensagem foi automática (disparo/fluxo/marketing de outra ferramenta) e o cliente
  // ainda não respondeu sai de "Andamento"/"Aguardando"; quando o cliente responde, volta para "Aguardando"
  `update conversations c set status = 'disparo'
    where (c.status = 'pending' or (c.status = 'open' and c.last_inbound_at is null))
      and (c.last_inbound_at is null or c.last_inbound_at < c.last_outbound_at)
      and coalesce(
            (select m.campaign_id is not null or m.flow_run_id is not null or (m.type = 'external' and m.pricing_category = 'marketing')
               from messages m where m.conversation_id = c.id and m.direction = 'out' order by m.ts desc, m.id desc limit 1),
            c.origin in ('disparo', 'fluxo') and c.last_outbound_at is null)`,
  // ---- v18: anexos grandes chegam em pedaços (a função da Vercel recebe ~4,5 MB por vez); ficam aqui só até montar o arquivo ----
  `create table if not exists media_uploads (
    upload_id text not null, idx integer not null, user_id integer, bytes bytea not null, created_at timestamptz default now(),
    primary key (upload_id, idx)
  )`,
  // ---- v19: recursos liga/desliga por empresa (validados primeiro na loja de homologação) e teleentrega ----
  `alter table companies add column if not exists features jsonb not null default '{}'::jsonb`,
  // faixas de entrega: nome (bairro/região), CEP inicial e final (8 dígitos; vazios = faixa só pelo nome) e valor
  `create table if not exists delivery_zones (
    id serial primary key, company_id integer not null, name text not null default '', cep_start text, cep_end text,
    cost numeric(10,2) not null default 0, position integer not null default 0,
    created_at timestamptz default now(), updated_at timestamptz default now()
  )`,
  `create index if not exists delivery_zones_company on delivery_zones (company_id, position, id)`,
  // custo por quilômetro (valor por km + mínimo), observação e o texto pronto que o atalho do Atendimento insere
  `create table if not exists delivery_settings (
    company_id integer primary key, km_price numeric(10,2), min_cost numeric(10,2), note text, message text, updated_at timestamptz default now()
  )`,
  // ---- v20: números que cada usuário acompanha na Visão geral (interruptor em Conexões); vazio = vê todos ----
  // padrões para empresas novas (funil, respostas rápidas, departamentos): editáveis em Configurações → Empresas
  `alter table settings add column if not exists company_defaults jsonb`,
  `create table if not exists user_watch_phones (user_id integer not null, phone_number_id text not null, created_at timestamptz default now(), primary key (user_id, phone_number_id))`,
];

export const SCHEMA_VERSION = 20;

export async function ensureSchema() {
  const sql = db();
  // Um envio só ao banco (e uma transação só): comando por comando eram ~150 idas e voltas, ~25 s no Neon,
  // e a primeira configuração parecia travada.
  await sql.unsafe(SCHEMA.join(";\n")).simple();
  await sql.unsafe("update settings set schema_version = $1 where id = 1", [SCHEMA_VERSION]);
}

let migrating: Promise<void> | null = null;
/** Garante que o banco está na versão atual (roda uma vez por instância do servidor). */
export function migrateOnce() {
  if (!migrating) {
    migrating = (async () => {
      try {
        const rows = await sql_version();
        if (rows[0]?.schema_version === SCHEMA_VERSION) return;
      } catch { /* tabela ainda não existe: segue para ensureSchema */ }
      await ensureSchema();
    })().catch((e) => { migrating = null; throw e; });
  }
  return migrating;
}

async function sql_version(): Promise<{ schema_version: number }[]> {
  return (await db().unsafe("select schema_version from settings where id = 1")) as any;
}
