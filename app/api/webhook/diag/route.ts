// Diagnóstico e configuração do webhook (só administradores).
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/guard";
import { siteUrl } from "@/lib/site";
import { configureApp, diagnose, routeNumbersHere, subscribeAll } from "@/lib/webhook-diag";
import { getScope } from "@/lib/access";
import { isMaster } from "@/lib/roles";
import { replayEchoes } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const r = await requireSession({ admin: true });
  if ("res" in r) return r.res;
  const base = await siteUrl();
  return NextResponse.json(await diagnose(r.s, base, await getScope(r.user)));
}

export async function POST(req: Request) {
  const r = await requireSession({ admin: true });
  if ("res" in r) return r.res;
  const base = await siteUrl();
  const body = await req.json().catch(() => ({}));
  const scope = await getScope(r.user);
  try {
    if (body.action === "configure_app") {
      if (!isMaster(r.user.role)) return NextResponse.json({ error: "Só o Master configura o app da Meta" }, { status: 403 });
      await configureApp(r.s, base);
      return NextResponse.json({ ok: true, diagnosis: await diagnose(r.s, base, scope) });
    }
    if (body.action === "replay_echoes") {
      // mensagens enviadas pelo celular que chegaram antes de o HUB tratar o campo (ficaram guardadas no log do webhook)
      if (!isMaster(r.user.role)) return NextResponse.json({ error: "Só o Master reprocessa o log do webhook" }, { status: 403 });
      return NextResponse.json({ ok: true, ...(await replayEchoes(Number(body.hours) || 72)) });
    }
    if (body.action === "route_numbers") {
      // muda a configuração de webhook dos números na Meta: só o Master
      if (!isMaster(r.user.role)) return NextResponse.json({ error: "Só o Master muda para onde vão as mensagens dos números" }, { status: 403 });
      const results = await routeNumbersHere(r.s, base, scope);
      return NextResponse.json({ ok: results.every((x) => x.ok), results, diagnosis: await diagnose(r.s, base, scope) });
    }
    if (body.action === "subscribe_wabas") {
      const results = await subscribeAll(r.s, scope);
      return NextResponse.json({ ok: results.every((x) => x.ok), results, diagnosis: await diagnose(r.s, base, scope) });
    }
    return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Falhou" }, { status: 400 });
  }
}
