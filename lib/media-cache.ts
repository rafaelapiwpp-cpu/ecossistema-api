// Mídia guardada no HUB: a cópia baixada da Meta fica no banco (tabela media_files).
// Abrir uma imagem passa a ser uma leitura local (rápida e com cache longo no navegador) — e a mídia não some
// quando a URL/arquivo da Meta expira (~30 dias).
import { query } from "./db";
import { fetchMedia } from "./chat";
import type { Settings } from "./settings";

/** Arquivos maiores que isso continuam vindo direto da Meta (vídeos/documentos grandes). */
export const MEDIA_CACHE_MAX = 12 * 1024 * 1024;

export type CachedMedia = { mime: string | null; size: number; width: number | null; height: number | null; bytes: Buffer };

/** Largura e altura de JPEG, PNG, GIF e WebP lendo só o cabeçalho (para reservar o espaço da imagem na conversa). */
export function imageSize(b: Buffer): { width: number; height: number } | null {
  try {
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; // PNG
    if (b.length > 10 && b.toString("ascii", 0, 3) === "GIF") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const kind = b.toString("ascii", 12, 16);
      if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (kind === "VP8L") { const bits = b.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) { // JPEG: procura o marcador SOF
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = b.readUInt16BE(i + 2);
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
          return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch { /* cabeçalho inesperado */ }
  return null;
}

export async function getCachedMedia(id: string): Promise<CachedMedia | null> {
  const [r] = await query<CachedMedia>("select mime, size, width, height, bytes from media_files where media_id = $1", [id]);
  return r ? { ...r, bytes: Buffer.isBuffer(r.bytes) ? r.bytes : Buffer.from(r.bytes as any) } : null;
}

/** Só os dados da cópia guardada (sem os bytes): usado nos pedidos por pedaço (Range), comuns em vídeo e áudio. */
export async function getCachedInfo(id: string): Promise<{ mime: string | null; size: number } | null> {
  const [r] = await query<{ mime: string | null; size: number }>("select mime, size from media_files where media_id = $1", [id]);
  return r || null;
}

/** Pedaço da cópia guardada, lido direto no banco (não carrega o arquivo inteiro a cada pedaço). */
async function readPart(id: string, start: number, length: number): Promise<Buffer> {
  const [r] = await query<{ part: Buffer }>("select substring(bytes from $2 for $3) as part from media_files where media_id = $1", [id, start + 1, length]);
  const p = r?.part as any;
  return Buffer.isBuffer(p) ? p : Buffer.from(p || []);
}

const CACHE_HEADERS = (mime: string | null, etag: string): Record<string, string> => ({
  "Content-Type": mime || "application/octet-stream",
  "Cache-Control": "private, max-age=31536000, immutable",
  ETag: etag,
  "Accept-Ranges": "bytes",
});

/** Intervalo pedido no cabeçalho Range (ou null para o arquivo inteiro; "bad" se estiver fora do arquivo). */
function rangeOf(req: Request, total: number): { start: number; end: number } | null | "bad" {
  const m = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get("range") || "").trim());
  if (!m || !(m[1] || m[2])) return null;
  let start: number, end: number;
  if (!m[1]) { start = Math.max(0, total - Number(m[2])); end = total - 1; }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1; }
  return start >= total || start > end ? "bad" : { start, end };
}

/** Entrega a cópia guardada: arquivo inteiro numa leitura, ou só o pedaço pedido (Range). */
export async function serveCached(req: Request, id: string, etag: string): Promise<Response | null> {
  if (req.headers.get("range")) {
    const info = await getCachedInfo(id);
    if (!info) return null;
    const rg = rangeOf(req, info.size);
    const base = CACHE_HEADERS(info.mime, etag);
    if (rg === "bad") return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${info.size}` } });
    if (rg) {
      const part = await readPart(id, rg.start, rg.end - rg.start + 1);
      return new Response(new Uint8Array(part.buffer, part.byteOffset, part.byteLength), { status: 206, headers: { ...base, "Content-Range": `bytes ${rg.start}-${rg.end}/${info.size}`, "Content-Length": String(part.byteLength) } });
    }
  }
  const f = await getCachedMedia(id);
  return f ? serveMedia(req, f, etag) : null;
}

export async function hasCachedMedia(id: string) {
  return (await query("select 1 from media_files where media_id = $1", [id])).length > 0;
}

/** Guarda uma cópia (ignora arquivo vazio ou grande demais; repetir não faz nada). */
export async function saveMedia(id: string, mime: string | null, bytes: Buffer, source: string): Promise<CachedMedia | null> {
  if (!id || !bytes.length || bytes.length > MEDIA_CACHE_MAX) return null;
  const dim = /^image\//.test(mime || "") ? imageSize(bytes) : null;
  const sane = dim && dim.width > 0 && dim.height > 0 && dim.width < 20000 && dim.height < 20000 ? dim : null;
  await query(
    `insert into media_files (media_id, mime, size, width, height, bytes, source) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (media_id) do nothing`,
    [id, mime, bytes.length, sane?.width ?? null, sane?.height ?? null, bytes, source],
  );
  return { mime, size: bytes.length, width: sane?.width ?? null, height: sane?.height ?? null, bytes };
}

/** Baixa da Meta e guarda (webhook, em segundo plano). Devolve o que ficou guardado, ou null se for grande demais. */
export async function cacheFromMeta(s: Settings, id: string, phoneNumberId: string | null): Promise<CachedMedia | null> {
  if (await hasCachedMedia(id)) return null;
  const { res, mime, size } = await fetchMedia(s, id, phoneNumberId);
  if (!res.ok || !res.body) throw new Error(`mídia ${id}: HTTP ${res.status}`);
  if (size && size > MEDIA_CACHE_MAX) { await res.body.cancel().catch(() => {}); return null; }
  const buf = Buffer.from(await res.arrayBuffer());
  return saveMedia(id, mime || res.headers.get("content-type"), buf, "webhook");
}

/** Mídias (imagem, figurinha, áudio, vídeo, documento) de uma lista de mensagens do webhook. */
export function mediaOf(messages: any[] | undefined): string[] {
  const out: string[] = [];
  for (const m of messages || []) {
    const t = m?.type;
    if (["image", "sticker", "audio", "video", "document"].includes(t) && m[t]?.id) out.push(String(m[t].id));
  }
  return out;
}

/** Resposta com os bytes em mãos (cache longo e imutável no navegador; aceita Range para áudio/vídeo no iPhone). */
export function serveMedia(req: Request, f: { mime: string | null; bytes: Buffer }, etag: string) {
  const total = f.bytes.length;
  const base = CACHE_HEADERS(f.mime, etag);
  const body = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  const rg = rangeOf(req, total);
  if (rg === "bad") return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${total}` } });
  if (rg) return new Response(body(f.bytes.subarray(rg.start, rg.end + 1)), { status: 206, headers: { ...base, "Content-Range": `bytes ${rg.start}-${rg.end}/${total}`, "Content-Length": String(rg.end - rg.start + 1) } });
  return new Response(body(f.bytes), { headers: { ...base, "Content-Length": String(total) } });
}
