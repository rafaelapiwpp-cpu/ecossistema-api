// Tipos e limites de mídia aceitos pela API oficial do WhatsApp (Cloud API). Usado no navegador e no servidor.
export type MediaKind = "image" | "video" | "audio" | "document";
export const MB = 1024 * 1024;
export const MEDIA_LIMITS: Record<MediaKind, number> = { image: 5 * MB, video: 16 * MB, audio: 16 * MB, document: 100 * MB };
export const KIND_LABEL: Record<MediaKind, string> = { image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento" };

const EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", heic: "image/heic", heif: "image/heif", avif: "image/avif",
  mp4: "video/mp4", m4v: "video/mp4", "3gp": "video/3gpp", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", avi: "video/x-msvideo",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", amr: "audio/amr", ogg: "audio/ogg", opus: "audio/ogg", oga: "audio/ogg", wav: "audio/wav", flac: "audio/flac", weba: "audio/webm",
  pdf: "application/pdf", txt: "text/plain", csv: "text/plain",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const ALIAS: Record<string, string> = {
  "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg", "audio/mp3": "audio/mpeg", "audio/x-mp3": "audio/mpeg", "audio/x-mpeg": "audio/mpeg",
  "audio/x-m4a": "audio/mp4", "audio/m4a": "audio/mp4", "audio/x-aac": "audio/aac", "audio/aacp": "audio/aac", "audio/opus": "audio/ogg",
  "audio/x-wav": "audio/wav", "video/x-m4v": "video/mp4", "text/csv": "text/plain", "application/csv": "text/plain",
};

/** Tipo do arquivo como a Meta espera (pela extensão quando o navegador não informa ou informa genérico). */
export function normalizeMime(type: string, name: string) {
  const t = String(type || "").toLowerCase().split(";")[0].trim();
  const ext = (String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
  const m = ALIAS[t] || t;
  return m && m !== "application/octet-stream" ? m : EXT[ext] || "application/octet-stream";
}
export const extOf = (name: string) => ((String(name || "").match(/\.([a-z0-9]+)$/i) || [])[1] || "").toUpperCase();

/** O que a Meta aceita em cada tipo de mensagem (documento aceita também imagem, vídeo e áudio dos formatos acima). */
export const SENDABLE: Record<MediaKind, string[]> = {
  image: ["image/jpeg", "image/png"],
  video: ["video/mp4", "video/3gpp"],
  audio: ["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"],
  document: [
    "application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};
export const sendableAs = (kind: MediaKind, mime: string) =>
  kind === "document" ? Object.values(SENDABLE).some((l) => l.includes(mime)) : SENDABLE[kind].includes(mime);
