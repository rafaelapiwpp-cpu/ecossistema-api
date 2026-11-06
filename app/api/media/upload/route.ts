import { NextResponse } from "next/server";
import { requireSession } from "@/lib/guard";
import { uploadMedia } from "@/lib/chat";
import { query } from "@/lib/db";
import { canSee, canSeePhone, getScope } from "@/lib/access";
import { saveMedia } from "@/lib/media-cache";
import { MEDIA_LIMITS, normalizeMime, type MediaKind } from "@/lib/media-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PART_MAX = 4 * 1024 * 1024; // cada pedaço fica abaixo do limite de ~4,5 MB por pedido da Vercel
const MAX_PARTS = 40;

/**
 * Sobe um arquivo para a Meta e guarda uma cópia no HUB (aparece na hora na conversa).
 * Arquivo grande (vídeo, PDF…) chega em pedaços de 3 MB: os pedaços ficam guardados por instantes e o último monta
 * o arquivo e envia para a Meta. Arquivo pequeno vem inteiro num pedido só (como antes).
 */
export async function POST(req: Request) {
  const r = await requireSession({ client: true });
  if ("res" in r) return r.res;
  const form = await req.formData();
  const file = form.get("file");
  const pnid = String(form.get("phone_number_id") || "");
  if (!(file instanceof Blob) || !pnid) return NextResponse.json({ error: "Arquivo ou número ausente" }, { status: 400 });
  const [pn] = await query<{ waba_id: string }>("select waba_id from phone_numbers where id = $1", [pnid]);
  const scope = await getScope(r.user);
  if (!pn || !canSee(scope, pn.waba_id) || !canSeePhone(scope, pnid)) return NextResponse.json({ error: "Número não encontrado" }, { status: 404 });
  const filename = String(form.get("name") || (file as any).name || "arquivo").slice(0, 200);
  const mime = normalizeMime(String(form.get("mime") || file.type || ""), filename);
  const total = Math.max(1, Math.floor(Number(form.get("total")) || 1));
  let blob: Blob = file;
  if (total > 1) {
    const uid = String(form.get("upload_id") || "");
    const idx = Number(form.get("index"));
    if (!/^[a-z0-9-]{8,64}$/i.test(uid) || !Number.isInteger(idx) || idx < 0 || idx >= total || total > MAX_PARTS || file.size > PART_MAX) {
      return NextResponse.json({ error: "Pedaço do arquivo inválido" }, { status: 400 });
    }
    if (idx === 0) await query("delete from media_uploads where created_at < now() - interval '2 hours'"); // sobras de envios interrompidos
    await query(
      "insert into media_uploads (upload_id, idx, user_id, bytes) values ($1, $2, $3, $4) on conflict (upload_id, idx) do update set bytes = excluded.bytes, created_at = now()",
      [uid, idx, r.user.id, Buffer.from(await file.arrayBuffer())],
    );
    if (idx < total - 1) return NextResponse.json({ ok: true, part: idx });
    const parts = await query<{ bytes: Buffer }>("select bytes from media_uploads where upload_id = $1 and user_id = $2 order by idx", [uid, r.user.id]);
    await query("delete from media_uploads where upload_id = $1", [uid]);
    if (parts.length !== total) return NextResponse.json({ error: "Faltou um pedaço do arquivo — envie de novo" }, { status: 400 });
    blob = new Blob(parts.map((p) => new Uint8Array(Buffer.isBuffer(p.bytes) ? p.bytes : Buffer.from(p.bytes as any))), { type: mime });
  }
  const kind = String(form.get("kind") || "document") as MediaKind;
  const limit = MEDIA_LIMITS[kind] ?? MEDIA_LIMITS.document;
  if (blob.size > limit) return NextResponse.json({ error: `Arquivo grande demais para o WhatsApp (máximo ${Math.round(limit / 1048576)} MB)` }, { status: 400 });
  try {
    const id = await uploadMedia(r.s, pnid, blob, mime, filename);
    try { await saveMedia(String(id), mime, Buffer.from(await blob.arrayBuffer()), "upload"); } catch (e) { console.error("media cache upload", e); }
    return NextResponse.json({ id, mime, filename, size: blob.size });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, details: e.details }, { status: 502 });
  }
}
