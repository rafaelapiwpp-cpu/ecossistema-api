import { configureDataSource, getDataSource } from "@eco/core";
import { prisma } from "./db";

/**
 * Liga o @eco/core ao Postgres deste app (schema único em prisma/schema.prisma).
 * O núcleo não conhece o Prisma: recebe só as linhas de cada tabela.
 *
 * Sem DATA_SOURCE definida: Postgres quando há DATABASE_URL (Vercel/Neon),
 * mock no desenvolvimento sem banco. DATA_SOURCE=mock força os dados simulados.
 */
configureDataSource({
  postgres: () => ({
    clientes: () => prisma.cliente.findMany({ orderBy: { criadoEm: "asc" } }),
    bms: () => prisma.bm.findMany({ orderBy: { criadoEm: "asc" } }),
    numeros: () => prisma.numero.findMany({ orderBy: { criadoEm: "asc" } }),
    templates: () => prisma.template.findMany({ orderBy: { criadoEm: "asc" } }),
    ping: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
  }),
  defaultKind: process.env.DATABASE_URL ? "postgres" : "mock",
});

export { getDataSource };
