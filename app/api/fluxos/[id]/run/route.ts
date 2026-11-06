// Processa a fila e os prazos de um fluxo (chamado pelo próprio sistema em cadeia, pelo "empurrão" e pelas telas).
import { NextResponse, after } from "next/server";
import { getSettings } from "@/lib/settings";
import { currentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { canSee, getScope } from "@/lib/access";
import { selfUrl } from "@/lib/campaigns";
import { processFlow, triggerFlowRun } from "@/lib/flows";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSettings();
  if (!s) return NextResponse.json({ error: "Sistema ainda não configurado" }, { status: 400 });
  const auth = req.headers.get("authorization") || "";
  const system = auth === `Bearer ${s.cron_secret}`;
  const user = system ? null : await currentUser(s);
  if (!system && !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const id = Number((await params).id);
  if (user) { // pelas telas: só quem vê a conta pode empurrar a fila
    const [row] = await query<{ waba_id: string }>("select waba_id from flows where id = $1", [id]);
    if (!row || !canSee(await getScope(user), row.waba_id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
  const result = await processFlow(s, id, 40000);
  if (result.ran && (result.remaining || 0) > 0) {
    const base = selfUrl(req);
    after(() => triggerFlowRun(s, base, id, 60000));
  }
  return NextResponse.json(result);
}
