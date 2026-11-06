import { NextResponse } from "next/server";
import { requireSession } from "@/lib/guard";
import { VIEW_COOKIE } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Visão do Master (Tudo · Minha BM · Equipe). Os demais papéis sempre veem só a Equipe. */
export async function POST(req: Request) {
  const r = await requireSession({ master: true });
  if ("res" in r) return r.res;
  const b = await req.json().catch(() => ({}));
  const view = b.view === "mine" || b.view === "team" ? b.view : "all";
  const res = NextResponse.json({ ok: true, view });
  res.cookies.set(VIEW_COOKIE, view, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
