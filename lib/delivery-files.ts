// Teleentrega: lê a tabela de faixas enviada pela empresa (TXT/CSV, planilha Excel/ODS ou PDF com texto) — só no servidor.
// Devolve as faixas encontradas para a prévia; a tela mostra, a pessoa confere e só então grava (lib/delivery.ts faz a leitura das linhas).
import { extractFromRows, extractFromText, type Parsed } from "./delivery";

export const MAX_FILE_BYTES = 3 * 1024 * 1024;

const decode = (buf: Buffer) => {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); } // arquivos salvos pelo Excel/Bloco de notas em pt-BR
};

export async function parseDeliveryFile(name: string, buf: Buffer): Promise<Parsed & { kind: "pdf" | "sheet" | "text" }> {
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
  if (ext === "pdf" || buf.subarray(0, 5).toString("latin1") === "%PDF-") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    if (!text.trim()) throw new Error("Este PDF não tem texto (parece uma foto/escaneado). Envie um PDF com texto, uma planilha ou um TXT.");
    return { kind: "pdf", ...extractFromText(text) };
  }
  if (["xlsx", "xlsm", "xls", "ods"].includes(ext)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "buffer", raw: false });
    const rows: unknown[][] = [];
    for (const n of wb.SheetNames) rows.push(...(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" }) as unknown[][]));
    return { kind: "sheet", ...extractFromRows(rows) };
  }
  return { kind: "text", ...extractFromText(decode(buf)) };
}
