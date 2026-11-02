-- =============================================================================
-- Bootstrap do primeiro operador (roda uma única vez na vida do banco).
--
-- Cria o login "dono" com uma senha temporária entregue ao dono fora do repo.
-- Aqui fica só o hash scrypt (não reversível). No primeiro acesso o painel
-- obriga a trocar login e senha. A flag em sistema_flag garante que isto
-- nunca mais roda, nem se a tabela de operadores ficar vazia.
-- =============================================================================
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sistema_flag WHERE chave = 'bootstrap_operador') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operador) THEN
    INSERT INTO public.operador (id, login, nome, papel, "senhaHash", "precisaTrocarSenha", "atualizadoEm")
    VALUES ('op_bootstrap_dono', 'dono', 'Dono', 'PLATFORM_OWNER',
            'scrypt$32768$8$1$XJZDkTc/1lN0IzFlfBZf0Q==$0krgekS/xil0Ucnh0U7EZiQg6LopYPUotyVMxbgYAcKRHnw+g0RcuXFM/hLI3OuH4qNj832h9Oeu6/EViom6rA==',
            true, now());
  END IF;
  INSERT INTO public.sistema_flag (chave, valor) VALUES ('bootstrap_operador', now()::text);
END
$do$;
