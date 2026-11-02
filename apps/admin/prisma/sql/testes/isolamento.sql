-- Teste de isolamento sobre o schema atual do admin. Rodar como o DONO das
-- tabelas (sem superusuário/BYPASSRLS), num banco descartável, depois de
-- aplicar prisma/sql/*.sql. Dados: clientes c_sol e c_lua, BMs bm_sol/bm_lua/bm_solta,
-- números n1 (Sol) e n2 (BM Lua, gravado com cliente errado), templates t1 (Sol) e t2 (Lua).
-- Saída esperada: só NOTICEs "OK n".
\set ON_ERROR_STOP on

-- 1) Sem contexto: nada aparece, nada grava (falha fechada)
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM bm) <> 0 OR (SELECT count(*) FROM operador) <> 0 THEN RAISE EXCEPTION 'FALHA 1: leu sem contexto'; END IF;
  BEGIN INSERT INTO bm (id,nome,"atualizadoEm") VALUES ('x','x',now()); RAISE EXCEPTION 'FALHA 1b: gravou sem contexto';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'OK 1: sem app.scope o dono não lê nem grava';
END $$;
COMMIT;

-- 2) Escopo de plataforma (painel admin): vê e altera tudo
BEGIN;
SELECT set_config('app.scope','platform',true) \g /dev/null
DO $$ BEGIN
  IF (SELECT count(*) FROM bm) <> 3 OR (SELECT count(*) FROM numero) <> 2 THEN RAISE EXCEPTION 'FALHA 2'; END IF;
  RAISE NOTICE 'OK 2: com escopo de plataforma o painel vê tudo';
  -- número antigo com cliente divergente foi corrigido pelo 001
  IF (SELECT "clienteId" FROM numero WHERE id='n2') <> 'c_lua' THEN RAISE EXCEPTION 'FALHA 3: n2 não alinhado'; END IF;
  RAISE NOTICE 'OK 3: dado antigo inconsistente foi alinhado ao cliente da BM';
  INSERT INTO numero (id,telefone,"bmId","clienteId","atualizadoEm") VALUES ('n3','+5511900000003','bm_lua','c_sol',now());
  IF (SELECT "clienteId" FROM numero WHERE id='n3') <> 'c_lua' THEN RAISE EXCEPTION 'FALHA 4'; END IF;
  RAISE NOTICE 'OK 4: número sempre herda o cliente da BM (não dá para ligar a outro cliente)';
  UPDATE bm SET "clienteId"='c_sol' WHERE id='bm_lua';
  IF (SELECT count(*) FROM numero WHERE "bmId"='bm_lua' AND "clienteId"='c_sol') <> 2 THEN RAISE EXCEPTION 'FALHA 5'; END IF;
  UPDATE bm SET "clienteId"='c_lua' WHERE id='bm_lua';
  RAISE NOTICE 'OK 5: trocar o cliente da BM leva os números junto';
  INSERT INTO audit_log (escopo, acao) VALUES ('PLATFORM','teste');
  BEGIN UPDATE audit_log SET acao='y'; RAISE EXCEPTION 'FALHA 6';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALHA%' THEN RAISE; END IF; END;
  RAISE NOTICE 'OK 6: auditoria é append-only';
  IF (SELECT count(*) FROM operador WHERE login='dono' AND "precisaTrocarSenha") <> 1 THEN RAISE EXCEPTION 'FALHA 7'; END IF;
  RAISE NOTICE 'OK 7: bootstrap criou o login "dono" com troca de senha obrigatória';
END $$;
INSERT INTO audit_log (escopo, "clienteId", acao) VALUES ('PLATFORM','c_sol','breakglass.iniciar'),('PLATFORM','c_lua','x');
COMMIT;

-- 3) Portal: papel app_tenant, cliente Sol
BEGIN;
SET LOCAL ROLE app_tenant;
SELECT set_config('app.tenant_id','c_sol',true) \g /dev/null
DO $$ BEGIN
  IF (SELECT count(*) FROM cliente) <> 1 OR (SELECT count(*) FROM template) <> 1 OR (SELECT count(*) FROM numero) <> 1 THEN
    RAISE EXCEPTION 'FALHA 8: tenant vê dados de outro cliente'; END IF;
  RAISE NOTICE 'OK 8: tenant só vê o próprio cliente, números e templates';
  BEGIN PERFORM 1 FROM bm; RAISE EXCEPTION 'FALHA 9';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK 9: tenant não lê BMs'; END;
  BEGIN PERFORM "bmId" FROM numero; RAISE EXCEPTION 'FALHA 10';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK 10: tenant não lê bmId/disjuntor do número'; END;
  BEGIN PERFORM 1 FROM operador; RAISE EXCEPTION 'FALHA 11';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK 11: tenant não lê operadores nem sessões'; END;
  BEGIN INSERT INTO template (id,nome,"clienteId",corpo,"atualizadoEm") VALUES ('tx','x','c_lua','x',now()); RAISE EXCEPTION 'FALHA 12';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK 12: tenant não grava template em outro cliente'; END;
  BEGIN UPDATE template SET "clienteId"='c_lua' WHERE id='t1'; RAISE EXCEPTION 'FALHA 13';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK 13: tenant não "doa" template a outro cliente'; END;
  IF (SELECT count(*) FROM audit_log) <> 1 THEN RAISE EXCEPTION 'FALHA 14'; END IF;
  RAISE NOTICE 'OK 14: tenant lê só a própria trilha de auditoria';
END $$;
-- injeção do escopo de plataforma não ajuda o tenant
SELECT set_config('app.scope','platform',true) \g /dev/null
DO $$ BEGIN
  IF (SELECT count(*) FROM template) <> 1 THEN RAISE EXCEPTION 'FALHA 15'; END IF;
  RAISE NOTICE 'OK 15: app_tenant que forja app.scope=platform continua isolado';
END $$;
COMMIT;

-- 4) Contexto não vaza para a próxima transação (pooler em modo transaction)
BEGIN;
DO $$ BEGIN
  IF app.escopo() IS NOT NULL OR app.tenant_atual() IS NOT NULL THEN RAISE EXCEPTION 'FALHA 16'; END IF;
  RAISE NOTICE 'OK 16: escopo e tenant morrem com a transação';
END $$;
COMMIT;

-- 5) Bootstrap nunca roda de novo
BEGIN;
SELECT set_config('app.scope','platform',true) \g /dev/null
DELETE FROM operador;
\ir ../002_bootstrap_operador.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM operador) <> 0 THEN RAISE EXCEPTION 'FALHA 17: bootstrap rodou de novo'; END IF;
  RAISE NOTICE 'OK 17: bootstrap não recria operador (mesmo com a tabela vazia)';
END $$;
COMMIT;

-- 6) Sessões e eventos de contingência também são invisíveis sem escopo
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM sessao) <> 0 OR (SELECT count(*) FROM evento_contingencia) <> 0
     OR (SELECT count(*) FROM audit_log) <> 0 THEN RAISE EXCEPTION 'FALHA 18'; END IF;
  RAISE NOTICE 'OK 18: sessões, eventos e auditoria somem sem escopo declarado';
END $$;
COMMIT;
