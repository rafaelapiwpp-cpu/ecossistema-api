"use client";
// Leitura de planilhas no navegador (CSV/TXT e Excel) para a importação de leads.
import { normalizePhone } from "./phone";

export type Table = { headers: string[]; rows: string[][]; source: string };

function decode(buf: ArrayBuffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); } // planilhas salvas pelo Excel em pt-BR
}

/** CSV com aspas, campos com quebra de linha e separador detectado (; , tab |). */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const head = text.split(/\r?\n/).slice(0, 8).join("\n");
  const sep = [";", ",", "\t", "|"].map((s) => [s, (head.match(new RegExp(`\\${s}`, "g")) || []).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));
  return rows;
}

const looksLikePhone = (v: string) => /\d{8,}/.test(v.replace(/\D/g, "")) && normalizePhone(v) !== "";

/** Primeira linha é cabeçalho? Se já parecer dado (tem telefone), inventa nomes de coluna. */
function withHeaders(rows: string[][], source: string): Table {
  if (!rows.length) return { headers: [], rows: [], source };
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
  const first = pad(rows[0]);
  const headerless = first.some(looksLikePhone) || first.every((c) => !/[a-zA-ZÀ-ú]/.test(c));
  if (headerless) return { headers: first.map((_, i) => `Coluna ${i + 1}`), rows: rows.map(pad), source };
  return { headers: first.map((h, i) => h || `Coluna ${i + 1}`), rows: rows.slice(1).map(pad), source };
}

export async function readTable(file: File): Promise<Table> {
  const name = file.name.toLowerCase();
  if (/\.(xlsx|xlsm|xls|ods)$/.test(name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    const rows = data
      .map((r) => r.map((v) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(v)) : String(v ?? "").trim())))
      .filter((r) => r.some((c) => c));
    return withHeaders(rows, `${file.name} · aba "${wb.SheetNames[0]}"`);
  }
  const text = decode(await file.arrayBuffer());
  return withHeaders(parseCsv(text), file.name);
}

/** Texto colado (um número por linha; aceita "nome;telefone" ou "telefone,nome"). */
export function readPasted(text: string): Table {
  const rows = parseCsv(text);
  return withHeaders(rows, "texto colado");
}

/** Sugere a coluna pelo nome do cabeçalho; se não achar, pelo conteúdo. */
export function guessColumns(t: Table) {
  const lower = t.headers.map((h) => h.toLowerCase());
  const byName = (words: string[]) => { const i = lower.findIndex((h) => words.some((w) => h.includes(w))); return i >= 0 ? t.headers[i] : ""; };
  let phone = byName(["telefone", "celular", "whats", "fone", "phone", "número", "numero", "mobile", "contato"]);
  if (!phone) {
    // coluna com mais telefones válidos nas primeiras linhas
    const sample = t.rows.slice(0, 50);
    const scores = t.headers.map((_, i) => sample.filter((r) => looksLikePhone(r[i] || "")).length);
    const best = scores.indexOf(Math.max(...scores));
    if (best >= 0 && scores[best] > 0) phone = t.headers[best];
  }
  const name = byName(["nome", "name", "cliente", "lead", "contato", "razão", "razao"]) || "";
  const email = byName(["mail"]) || "";
  return { phone, name: name === phone ? "" : name, email: email === phone ? "" : email };
}
