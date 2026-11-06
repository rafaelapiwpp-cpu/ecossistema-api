import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth";

/** Sai e volta para o login — o do portal da empresa quando o formulário manda `company`. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const slug = String(form?.get("company") || "").trim().toLowerCase();
  const dest = /^[a-z0-9-]{2,40}$/.test(slug) ? `/${slug}/login` : "/login";
  const res = NextResponse.redirect(new URL(dest, req.url), 303);
  res.cookies.delete(COOKIE);
  return res;
}
