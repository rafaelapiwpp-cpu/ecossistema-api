-- =============================================================================
-- Ecossistema API · apps/admin — Row Level Security sobre o schema Prisma atual
-- (doc 04 §3). Idempotente: roda em TODO build, depois do `prisma db push`,
-- por scripts/aplicar-sql.cjs, dentro de UMA transação.
--
-- O Prisma não gerencia políticas, funções, papéis nem triggers: eles moram
-- aqui. Colunas seguem os nomes do Prisma (camelCase, entre aspas).
--
-- Modelo:
--   * Toda tabela: ENABLE + FORCE ROW LEVEL SECURITY (vale até para o dono).
--   * Escopo "platform" (painel admin): lib/db.ts faz SET LOCAL app.scope =
--     'platform' em cada operação. Sem esse contexto, a consulta vê ZERO
--     linhas (falha fechada).
--   * Papel app_tenant (portal do cliente, futuro): NOBYPASSRLS; enxerga só
--     linhas com "clienteId" = app.tenant_id, e só nas tabelas liberadas.
--     A app entra nele com SET LOCAL ROLE app_tenant (lib/db.ts › comTenant),
--     então o isolamento vale mesmo se o dono da conexão tiver BYPASSRLS.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.escopo() RETURNS text LANGUAGE sql STABLE AS
$fn$ SELECT nullif(current_setting('app.scope', true), '') $fn$;

CREATE OR REPLACE FUNCTION app.tenant_atual() RETURNS text LANGUAGE sql STABLE AS
$fn$ SELECT nullif(current_setting('app.tenant_id', true), '') $fn$;

-- Papel do portal. Criado sem LOGIN: a app assume o papel dentro da transação.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant NOLOGIN NOBYPASSRLS;
  END IF;
  BEGIN
    EXECUTE format('GRANT app_tenant TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  EXCEPTION WHEN syntax_error OR feature_not_supported THEN
    EXECUTE format('GRANT app_tenant TO %I', current_user);  -- Postgres < 16
  END;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sem permissão para criar/conceder app_tenant; políticas de tenant ficam inertes.';
END
$do$;

-- ---------------------------------------------------------------------------
-- RLS em todas as tabelas
-- ---------------------------------------------------------------------------
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cliente','bm','numero','template','operador','sessao',
                           'audit_log','evento_contingencia','webhook_evento','sistema_flag']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    -- Plataforma: tudo, desde que o contexto tenha sido declarado.
    EXECUTE format('DROP POLICY IF EXISTS plataforma ON public.%I', t);
    EXECUTE format($p$CREATE POLICY plataforma ON public.%I FOR ALL TO PUBLIC
      USING (app.escopo() = 'platform' AND current_user <> 'app_tenant')
      WITH CHECK (app.escopo() = 'platform' AND current_user <> 'app_tenant')$p$, t);
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------------
-- Portal (app_tenant): só o próprio cliente, só o que foi concedido.
-- BM, operador, sessão, eventos internos e flags: nenhum acesso.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS tenant ON public.cliente;
  CREATE POLICY tenant ON public.cliente FOR SELECT TO app_tenant
    USING (id = app.tenant_atual());

  DROP POLICY IF EXISTS tenant ON public.numero;
  CREATE POLICY tenant ON public.numero FOR SELECT TO app_tenant
    USING ("clienteId" = app.tenant_atual());

  DROP POLICY IF EXISTS tenant ON public.template;
  CREATE POLICY tenant ON public.template FOR ALL TO app_tenant
    USING ("clienteId" = app.tenant_atual())
    WITH CHECK ("clienteId" = app.tenant_atual());

  -- Transparência (LGPD): o cliente lê a trilha que o afeta.
  DROP POLICY IF EXISTS tenant ON public.audit_log;
  CREATE POLICY tenant ON public.audit_log FOR SELECT TO app_tenant
    USING ("clienteId" = app.tenant_atual());

  GRANT USAGE ON SCHEMA public, app TO app_tenant;
  GRANT EXECUTE ON FUNCTION app.escopo(), app.tenant_atual() TO app_tenant;
  REVOKE ALL ON public.cliente, public.bm, public.numero, public.template, public.operador,
    public.sessao, public.audit_log, public.evento_contingencia, public.webhook_evento,
    public.sistema_flag FROM app_tenant;
  GRANT SELECT ON public.cliente TO app_tenant;
  -- Número: sem bmId, disjuntor, motivoPausa, metaPhoneId, notas (dados de contingência).
  GRANT SELECT (id, telefone, "clienteId", status, qualidade) ON public.numero TO app_tenant;
  GRANT SELECT, INSERT, UPDATE ON public.template TO app_tenant;
  GRANT SELECT ON public.audit_log TO app_tenant;
END
$do$;

-- ---------------------------------------------------------------------------
-- Consistência de tenant (camada 4 do doc 04): o cliente do número é sempre
-- o cliente da BM dele. Feito por trigger porque o `db push` apagaria uma FK
-- composta que não estivesse no schema Prisma.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.numero_herda_cliente() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."bmId" IS NOT NULL THEN
    SELECT b."clienteId" INTO NEW."clienteId" FROM public.bm b WHERE b.id = NEW."bmId";
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS numero_herda_cliente ON public.numero;
CREATE TRIGGER numero_herda_cliente BEFORE INSERT OR UPDATE OF "bmId", "clienteId" ON public.numero
  FOR EACH ROW EXECUTE FUNCTION app.numero_herda_cliente();

CREATE OR REPLACE FUNCTION app.bm_propaga_cliente() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  UPDATE public.numero SET "clienteId" = NEW."clienteId" WHERE "bmId" = NEW.id;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS bm_propaga_cliente ON public.bm;
CREATE TRIGGER bm_propaga_cliente AFTER UPDATE OF "clienteId" ON public.bm
  FOR EACH ROW WHEN (OLD."clienteId" IS DISTINCT FROM NEW."clienteId")
  EXECUTE FUNCTION app.bm_propaga_cliente();

-- Alinha dados antigos (antes do trigger existir).
UPDATE public.numero n SET "clienteId" = b."clienteId"
  FROM public.bm b
  WHERE n."bmId" = b.id AND n."clienteId" IS DISTINCT FROM b."clienteId";

-- ---------------------------------------------------------------------------
-- Auditoria append-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.audit_imutavel() RETURNS trigger LANGUAGE plpgsql AS
$fn$ BEGIN RAISE EXCEPTION 'audit_log é append-only'; END $fn$;

DROP TRIGGER IF EXISTS audit_imutavel ON public.audit_log;
CREATE TRIGGER audit_imutavel BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION app.audit_imutavel();
