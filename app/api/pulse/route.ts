// Tempo real por consulta curta: a tela pergunta "mudou algo depois do cursor X?" (a cada ~1,5 s com a aba à vista,
// 20 s com ela escondida) e o servidor responde na hora — uma consulta indexada, sem segurar a conexão.
// Segurar a conexão (long polling) deixaria uma função da Vercel cobrando memória o tempo todo com qualquer aba aberta.
// Retomar pelo cursor não perde nada.
//   GET            → ponto de partida { cursor }
//   POST { cursor, have: [ids já recebidos depois do cursor] } → { cursor, changes: [{ id, c: conversa, k: tipo }], more?, reset? }
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/guard";
import { getScopeCached } from "@/lib/access";
import { changesAfter, logBounds, newestSettled, pruneChanges } from "@/lib/changes";

export const dynamic = "force-dynamic";

const LIMIT = 400;
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  return NextResponse.json({ cursor: await newestSettled(), changes: [] }, NO_STORE);
}

export async function POST(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const b = await req.json().catch(() => ({}));
  const cursor = Math.max(0, Math.floor(Number(b.cursor) || 0));
  const have = new Set<number>((Array.isArray(b.have) ? b.have : []).map(Number).filter((n: number) => Number.isFinite(n) && n > cursor));

  const scope = await getScopeCached(r.user);
  const [rows, bounds] = await Promise.all([changesAfter(scope, cursor, LIMIT), logBounds()]);
  if (Math.random() < 1 / 2000) pruneChanges().catch(() => {}); // manutenção leve, sem depender do cron

  // cursor anterior ao registro mais antigo (registro limpo ou aba parada há dias): a tela recarrega tudo
  if (cursor && bounds.oldest && cursor < bounds.oldest - 1) return NextResponse.json({ cursor: bounds.newest, changes: [], reset: true }, NO_STORE);

  // cursor seguro: avança só por linhas já assentadas; sem nada pendente, pula também as mudanças de outras contas
  let safe = cursor;
  let pending = false;
  for (const x of rows) { if (!x.settled) { pending = true; break; } safe = Number(x.id); }
  if (!pending && rows.length < LIMIT) safe = Math.max(safe, bounds.newest);
  return NextResponse.json({
    cursor: safe,
    changes: rows.filter((x) => !have.has(Number(x.id))).map((x) => ({ id: Number(x.id), c: x.conversation_id, k: x.kind })),
    more: rows.length >= LIMIT,
  }, NO_STORE);
}
