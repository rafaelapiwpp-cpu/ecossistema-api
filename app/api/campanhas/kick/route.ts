// "Empurrão": põe para rodar as campanhas devidas (agendadas que chegaram na hora ou em andamento sem ninguém processando).
// Não precisa de login: só dispara trabalho que já estava programado. Chamado pelo cron diário, por um agendador externo e pelas telas.
import { NextResponse, after } from "next/server";
import { getSettings } from "@/lib/settings";
import { dueCampaigns, kickCampaigns, selfUrl } from "@/lib/campaigns";
import { dueFlows, kickFlows } from "@/lib/flows";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const s = await getSettings();
  if (!s) return NextResponse.json({ ok: false, error: "Sistema ainda não configurado" }, { status: 400 });
  const [due, flows] = await Promise.all([dueCampaigns(), dueFlows()]);
  if (due.length || flows.length) {
    const base = selfUrl(req);
    after(async () => { if (due.length) await kickCampaigns(s, base); if (flows.length) await kickFlows(s, base); });
  }
  return NextResponse.json({ ok: true, due: due.length, flows: flows.length });
}

export const GET = handle;
export const POST = handle;
