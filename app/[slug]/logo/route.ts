// Logo da empresa (arquivo enviado em Configurações → Empresas), servido com cache para o portal, o login e o ícone da aba.
import { createHash } from "node:crypto";
import { companyBySlug } from "@/lib/access";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!hasDb()) return new Response("", { status: 404 });
  const { slug } = await params;
  const c = await companyBySlug(slug);
  if (!c?.logo_url) return new Response("", { status: 404 });
  if (!c.logo_url.startsWith("data:")) return Response.redirect(c.logo_url, 302);
  const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(c.logo_url);
  if (!m) return new Response("", { status: 404 });
  const etag = `"${createHash("sha1").update(c.logo_url).digest("hex").slice(0, 20)}"`;
  const headers = { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400", ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(Buffer.from(m[2], "base64"), { headers: { ...headers, "Content-Type": m[1], "X-Content-Type-Options": "nosniff" } });
}
