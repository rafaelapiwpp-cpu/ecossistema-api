-- Dados do teste de isolamento. Rodar ANTES de aplicar prisma/sql/*.sql num banco
-- recém-criado pelo `prisma db push` (ainda sem RLS). n2 está gravado com o
-- cliente errado de propósito: o 001 precisa alinhá-lo ao cliente da BM.
INSERT INTO cliente (id, nome, slug, "atualizadoEm") VALUES
  ('c_sol', 'Clínica Sol', 'sol', now()), ('c_lua', 'Loja Lua', 'lua', now());
INSERT INTO bm (id, nome, "clienteId", "atualizadoEm") VALUES
  ('bm_sol', 'BM Sol', 'c_sol', now()), ('bm_lua', 'BM Lua', 'c_lua', now()), ('bm_solta', 'BM sem cliente', NULL, now());
INSERT INTO numero (id, telefone, "bmId", "clienteId", "atualizadoEm") VALUES
  ('n1', '+5551900000001', 'bm_sol', 'c_sol', now()), ('n2', '+5511900000002', 'bm_lua', 'c_sol', now());
INSERT INTO template (id, nome, "clienteId", corpo, "atualizadoEm") VALUES
  ('t1', 'lembrete', 'c_sol', 'Olá', now()), ('t2', 'promo', 'c_lua', 'Oi', now());
