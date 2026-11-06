// Motor do disparo: processa um lote e, se sobrar fila, chama a si mesmo para o próximo lote.
import { NextResponse, after } from "next/server";
import { getSettings } from "@/lib/settings";
import { currentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { canSee, getScope } from "@/lib/access";
import { runCampaign, selfUrl, triggerRun } from "@/lib/campaigns";

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
    const [row] = await query<{ waba_id: string }>("select waba_id from campaigns where id = $1", [id]);
    if (!row || !canSee(await getScope(user), row.waba_id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
  const result = await runCampaign(s, id);
  if (result.ran && (result.remaining ?? 0) > 0) {
    const base = selfUrl(req);
    after(() => triggerRun(s, base, id, 60000)); // espera o próximo lote responder (≈ 40 s) para a cadeia não depender de ninguém
  }
  return NextResponse.json(result);
}
