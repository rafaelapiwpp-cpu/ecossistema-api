import { requireSession } from "@/lib/guard";
import { fetchMedia } from "@/lib/chat";
import { query } from "@/lib/db";
import { canSee, canSeePhone, getScope } from "@/lib/access";
import { MEDIA_CACHE_MAX, saveMedia, serveCached, serveMedia } from "@/lib/media-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Entrega uma mídia: primeiro a cópia guardada no HUB (rápida e permanente); se ainda não houver,
 * busca na Meta, guarda e entrega. Arquivos grandes demais continuam vindo direto da Meta.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const id = (await params).id;
  if (!/^\d+$/.test(id)) return new Response("id inválido", { status: 400 });
  const scope = await getScope(r.user);
  // mídia de uma mensagem: só para quem vê a conta da conversa
  const [m] = await query<{ waba_id: string | null; phone_number_id: string | null }>("select waba_id, phone_number_id from messages where media_id = $1 limit 1", [id]);
  if (m && (!canSee(scope, m.waba_id) || !canSeePhone(scope, m.phone_number_id))) return new Response("mídia indisponível", { status: 404 });
  if (!m && scope.phones) return new Response("mídia indisponível", { status: 404 }); // portal: só mídia de mensagens dos seus números

  const etag = `"m${id}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, max-age=31536000, immutable" } });

  const cached = await serveCached(req, id, etag);
  if (cached) return cached;

  // mídia avulsa (cabeçalho de template/fluxo): só tenta com os tokens das BMs visíveis
  const only = scope.all ? undefined : scope.view === "team" ? (c: { visibility: string }) => c.visibility === "team" : (c: { visibility: string }) => c.visibility !== "team";
  try {
    const { res, mime, size } = await fetchMedia(r.s, id, m?.phone_number_id || null, only);
    if (!res.ok || !res.body) return new Response("mídia indisponível", { status: 404 });
    const type = mime || res.headers.get("content-type") || "application/octet-stream";
    if (size && size > MEDIA_CACHE_MAX) {
      return new Response(res.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const saved = await saveMedia(id, type, buf, "view").catch(() => null);
    return serveMedia(req, saved || { mime: type, bytes: buf }, etag);
  } catch (e: any) {
    return new Response(e.message || "erro", { status: 502 });
  }
}
