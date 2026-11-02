import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Acesso ao banco do painel admin. É o ÚNICO lugar que cria o cliente Prisma.
 *
 * Todas as tabelas têm RLS com FORCE (prisma/sql/001_rls.sql): sem declarar o
 * escopo, o banco devolve zero linhas e recusa escrita (falha fechada). Por isso:
 *
 * - `prisma`        → cliente do painel. Cada operação roda numa transação curta
 *                      que faz SET LOCAL app.scope = 'platform' antes da consulta.
 *                      O código das telas continua escrevendo `prisma.bm.findMany(...)`.
 * - `comPlataforma` → transação interativa com escopo de plataforma (várias
 *                      escritas que precisam ir juntas).
 * - `comTenant`     → transação no papel `app_tenant` (NOBYPASSRLS) com
 *                      app.tenant_id = cliente. É o caminho do futuro portal:
 *                      o isolamento vale mesmo se o dono da conexão ignorar RLS.
 *
 * SET LOCAL / set_config(..., true) morre no fim da transação: seguro com o
 * pooler do Neon (PgBouncer em modo transaction).
 */

const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

const base =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = base;

export const prisma = base.$extends({
  name: "escopo-plataforma",
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const [, resultado] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.scope', 'platform', true)`,
          query(args),
        ]);
        return resultado;
      },
    },
  },
});

export type Tx = Prisma.TransactionClient;

/** Transação interativa com escopo de plataforma (painel admin). */
export function comPlataforma<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return base.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.scope', 'platform', true)`;
    return fn(tx);
  });
}

const ID_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Transação isolada em um cliente (tenant). O `clienteId` precisa vir da SESSÃO
 * do usuário do portal, nunca de body/query/params/host (doc 04 §3, camada 1).
 */
export function comTenant<T>(clienteId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!ID_SEGURO.test(clienteId)) throw new Error("clienteId inválido");
  return base.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL ROLE app_tenant`;
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${clienteId}, true)`;
    return fn(tx);
  });
}
