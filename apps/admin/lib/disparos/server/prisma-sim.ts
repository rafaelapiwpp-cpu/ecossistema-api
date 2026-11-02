/**
 * Peças do modo simulação sobre o banco (Neon), para funcionar em serverless:
 * cada instância da Vercel enxerga a mesma fila e a mesma trava.
 *
 *  - PrismaSimQueue: webhooks simulados (status e respostas, no formato da Meta)
 *    ficam em `webhook_event` com `dueAt`; quem processar primeiro leva
 *    (UPDATE ... FOR UPDATE SKIP LOCKED).
 *  - withLease: um tick do worker por vez entre instâncias (`worker_lease`).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import type { SimQueue } from '../whatsapp/mock-provider';
import type { MetaWebhookPayload } from '../whatsapp/meta-webhook';

export class PrismaSimQueue implements SimQueue {
  constructor(private readonly db: PrismaClient) {}

  async push(items: { at: number; payload: MetaWebhookPayload }[]) {
    if (!items.length) return;
    await this.db.webhookEvent.createMany({
      data: items.map((i) => ({ source: 'simulation', dueAt: new Date(i.at), payload: i.payload as unknown as Prisma.InputJsonValue })),
    });
  }

  async takeDue(now: number, limit: number): Promise<MetaWebhookPayload[]> {
    const rows = await this.db.$queryRaw<{ payload: unknown; dueAt: Date }[]>`
      UPDATE "webhook_event" SET "processedAt" = now()
      WHERE "id" IN (
        SELECT "id" FROM "webhook_event"
        WHERE "source" = 'simulation' AND "processedAt" IS NULL AND "dueAt" <= ${new Date(now)}
        ORDER BY "dueAt" ASC LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "payload", "dueAt"`;
    return rows
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .map((r) => r.payload as MetaWebhookPayload);
  }

  async size() {
    return this.db.webhookEvent.count({ where: { source: 'simulation', processedAt: null } });
  }
}

/**
 * Executa `fn` só se conseguir a trava `name` (válida por `ms`). Devolve false
 * se outra instância já está no meio de um tick.
 */
export async function withLease(db: PrismaClient, name: string, ms: number, fn: () => Promise<void>): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + ms);
  const got = await db.$executeRaw`
    INSERT INTO "worker_lease" ("name", "until") VALUES (${name}, ${until})
    ON CONFLICT ("name") DO UPDATE SET "until" = EXCLUDED."until"
    WHERE "worker_lease"."until" < ${now}`;
  if (got === 0) return false;
  try {
    await fn();
  } finally {
    await db.$executeRaw`UPDATE "worker_lease" SET "until" = now() WHERE "name" = ${name}`;
  }
  return true;
}
