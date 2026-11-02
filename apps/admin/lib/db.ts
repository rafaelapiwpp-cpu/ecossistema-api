import { PrismaClient } from "@prisma/client";

/**
 * Cliente Prisma como singleton (evita esgotar conexões no dev/serverless).
 * Usa a DATABASE_URL (pooled/pgbouncer) do Neon em runtime; migrações usam a
 * DATABASE_URL_UNPOOLED (directUrl no schema).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
