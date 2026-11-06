import { NextResponse, after } from "next/server";
import { getSettings } from "@/lib/settings";
import { currentUser } from "@/lib/auth";
import { runSync } from "@/lib/sync";
import { kickCampaigns, selfUrl } from "@/lib/campaigns";
import { kickFlows } from "@/lib/flows";
import { listConnections } from "@/lib/connections";
import { isMaster } from "@/lib/roles";
import { pruneChanges } from "@/lib/changes";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const s = await getSettings();
  if (!s) return NextResponse.json({ error: "Sistema ainda não configurado" }, { status: 400 });
  const ua = req.headers.get("user-agent") || "";
  const auth = req.headers.get("authorization") || "";
  const cron = req.method === "GET" && (ua.startsWith("vercel-cron/") || auth === `Bearer ${s.cron_secret}`);
  const user = cron ? null : await currentUser(s);
  if (!cron && !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (user?.must_change_password) return NextResponse.json({ error: "Troque a senha provisória antes de continuar." }, { status: 403 });
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") || 7), 1), 365);
  // pelo botão: o Master sincroniza tudo; os demais só as conexões de Equipe (e só veem o relatório delas)
  const team = user && !isMaster(user.role) ? (await listConnections()).filter((c) => c.visibility === "team").map((c) => c.id) : undefined;
  const asked = Number(new URL(req.url).searchParams.get("connection") || 0);
  const ids = asked ? (team ? team.filter((id) => id === asked) : [asked]) : team;
  const full = await runSync(s, days, { connectionIds: ids });
  const result = team ? { ok: full.ok, log: full.log.filter((l) => !l.conn || team.includes(l.conn)) } : full;
  const base = selfUrl(req);
  after(async () => {
    await kickCampaigns(s, base);
    await kickFlows(s, base);
    if (cron) await pruneChanges(2).catch((e) => console.error("limpeza do registro de mudanças", e)); // o registro do tempo real guarda só 2 dias
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}

// GET = Vercel Cron (diário) · POST = botão "Sincronizar agora"
export const GET = handle;
export const POST = handle;
