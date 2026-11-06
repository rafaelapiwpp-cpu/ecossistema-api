// Anexos do Atendimento (navegador): prepara cada arquivo (tipo de envio, formato, tamanho) e sobe em pedaços.
import { KIND_LABEL, MB, MEDIA_LIMITS, extOf, normalizeMime, sendableAs, type MediaKind } from "@/lib/media-types";

export type Staged = {
  id: string; file: File; name: string; size: number; mime: string; kind: MediaKind;
  /** prévia local (blob:) */
  url: string; caption: string;
  /** aviso (ex.: imagem reduzida) */
  note?: string;
  /** impede o envio (formato não aceito, grande demais) */
  error?: string;
};

export const fmtSize = (n: number) => (n >= MB ? `${(n / MB).toFixed(n >= 10 * MB ? 0 : 1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const sid = () => Math.random().toString(36).slice(2, 10);

const HINT: Record<MediaKind, string> = {
  image: "Envie JPG ou PNG.",
  video: "Envie MP4 (até 16 MB).",
  audio: "Envie MP3, M4A, OGG, AAC ou AMR.",
  document: "Aceitos: PDF, Word, Excel, PowerPoint, TXT/CSV, imagens, vídeos MP4 e áudios.",
};

/** Imagem em outro formato (WEBP, GIF, BMP…) ou maior que 5 MB vira JPG (até 4,8 MB), sem perder a proporção. */
async function toJpeg(f: File): Promise<File | null> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(f); } catch { return null; }
  for (const [max, q] of [[2560, 0.86], [2048, 0.8], [1600, 0.75], [1280, 0.7]] as const) {
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); if (!g) return null;
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); // JPG não tem transparência
    g.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= 4.8 * MB) return new File([blob], `${f.name.replace(/\.[^.]+$/, "") || "imagem"}.jpg`, { type: "image/jpeg" });
  }
  return null;
}

/** Imagem colada (Ctrl+V) chega como "image.png": ganha um nome com a hora. */
export function namePasted(f: File) {
  if (!/^image\.(png|jpe?g|gif|webp)$/i.test(f.name || "")) return f;
  const t = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  return new File([f], `imagem-colada-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}.${f.name.split(".").pop()}`, { type: f.type });
}

/** Decide como o arquivo vai (imagem, vídeo, áudio ou documento) e já avisa o que não dá para enviar. */
export async function stageFile(f: File, asDoc = false): Promise<Staged> {
  let file = f, mime = normalizeMime(f.type, f.name), note: string | undefined, error: string | undefined;
  const top = mime.split("/")[0];
  const kind: MediaKind = asDoc ? "document" : top === "image" ? "image" : top === "video" ? "video" : top === "audio" ? "audio" : "document";
  if (top === "image" && (!["image/jpeg", "image/png"].includes(mime) || f.size > MEDIA_LIMITS.image)) {
    const jpg = await toJpeg(f);
    if (jpg) { note = f.size > MEDIA_LIMITS.image ? `Reduzida de ${fmtSize(f.size)} para ${fmtSize(jpg.size)} (o WhatsApp aceita até 5 MB)` : `Convertida de ${extOf(f.name) || mime} para JPG`; file = jpg; mime = "image/jpeg"; }
    else error = `Não consegui abrir esta imagem${extOf(f.name) ? ` (.${extOf(f.name)})` : ""}. Salve como JPG ou PNG e tente de novo.`;
  }
  if (!error && !sendableAs(kind, mime)) {
    const ext = extOf(f.name);
    error = `${ext ? `.${ext}` : "Este formato"} não é aceito pelo WhatsApp${kind === "document" ? "" : ` como ${KIND_LABEL[kind].toLowerCase()}`}. ${HINT[kind]}`;
  } else if (!error) {
    // vídeo e áudio têm o limite deles mesmo quando vão como documento
    const lim = kind === "document" && (top === "video" || top === "audio") ? MEDIA_LIMITS[top] : MEDIA_LIMITS[kind];
    if (file.size > lim) error = `${fmtSize(file.size)} é grande demais: o WhatsApp aceita até ${lim / MB} MB${kind === "document" && lim === MEDIA_LIMITS.document ? "" : ` para ${(top === "video" || top === "audio" ? KIND_LABEL[top] : KIND_LABEL[kind]).toLowerCase()}`}.${top === "video" ? " Corte ou comprima o vídeo." : ""}`;
  }
  return { id: sid(), file, name: file.name || "arquivo", size: file.size, mime, kind, url: URL.createObjectURL(file), caption: "", note, error };
}

/** Sobe para a Meta pelo HUB: inteiro até 3 MB; maior, em pedaços de 3 MB (o servidor monta). */
export async function uploadStaged(it: Staged, pnid: string, onProgress: (p: number) => void) {
  const CHUNK = 3 * MB;
  const total = Math.max(1, Math.ceil(it.file.size / CHUNK));
  const uid = total > 1 ? `${Date.now().toString(36)}-${sid()}${sid()}` : "";
  let last: any = null;
  for (let i = 0; i < total; i++) {
    const fd = new FormData();
    fd.set("file", total > 1 ? it.file.slice(i * CHUNK, (i + 1) * CHUNK) : it.file, it.name);
    fd.set("phone_number_id", pnid); fd.set("mime", it.mime); fd.set("name", it.name); fd.set("kind", it.kind);
    if (total > 1) { fd.set("upload_id", uid); fd.set("index", String(i)); fd.set("total", String(total)); }
    const r = await fetch("/api/media/upload", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({ error: r.status === 413 ? "Arquivo grande demais para enviar" : `Falha no envio do arquivo (${r.status})` }));
    if (!r.ok) throw new Error(j.error || "Falha no envio do arquivo");
    last = j;
    onProgress((i + 1) / total);
  }
  return last as { id: string; mime: string; filename: string; size: number };
}
