// Teleentrega: faixas de CEP, custo por quilômetro e o texto pronto do atalho do Atendimento.
// Só regras puras (sem banco): servem no servidor e nas telas. Leitura de arquivos: lib/delivery-files.ts.
import { isClient, isManagerRole } from "./roles";

export type Zone = { id: number; name: string; cep_start: string | null; cep_end: string | null; cost: number; position: number };
export type DeliverySettings = { km_price: number | null; min_cost: number | null; note: string | null; message: string | null };
export type ParsedZone = { name: string; cep_start: string | null; cep_end: string | null; cost: number };
export type Parsed = { zones: ParsedZone[]; km_price: number | null; min_cost: number | null; ignored: number };
export type Lookup =
  | { kind: "cep"; cep: string; zone: Zone | null }
  | { kind: "km"; km: number; cost: number | null }
  | { kind: "name"; q: string; zones: Zone[] };

/** Texto que o atalho insere na mensagem. {local} = bairro/faixa ou "x km", {valor} = R$, {cep} e {km} quando houver. */
export const DEFAULT_MESSAGE = "A tele-entrega para {local} fica em {valor}. Posso confirmar o pedido?";
export const MAX_ZONES = 2000;

/** Quem edita a tabela: usuários da empresa e a equipe (gestor ou acima); atendente interno só consulta. */
export const canEditDelivery = (role: string | null | undefined) => isClient(role) || isManagerRole(role);

// CEP como aparece nas tabelas: 90.000-000, 90000-000, 90000000 — e colados (PDF sem espaço entre colunas): 90000-00090099-999, 9000000090099999
const CEP_RE = /\d{2}\.\d{3}-\d{3}|\d{5}-\d{3}|\b\d{16}\b|\b\d{8}\b/g;
const cepsIn = (line: string) => [...line.matchAll(CEP_RE)].flatMap((m) => { const d = m[0].replace(/\D/g, ""); return d.length === 16 ? [d.slice(0, 8), d.slice(8)] : [d]; });
const MONEY_RE = /(?:r\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\b|r\$\s*\d+(?:[.,]\d{1,2})?|\b\d+(?:[.,]\d{1,2})?\b/gi;

export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** "90.000-000" → "90000000"; qualquer coisa que não tenha 8 dígitos → null */
export const cepDigits = (v: unknown) => { const d = String(v ?? "").replace(/\D/g, ""); return d.length === 8 ? d : null; };
export const fmtCep = (d: string | null | undefined) => (d && d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d || "");
export const money = (n: number | string | null | undefined) =>
  "R$ " + Number(n || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** "R$ 7,50" / "7.50" / "1.250,00" / "8" → número; sem número válido → null */
export function parseMoney(v: unknown): number | null {
  let s = String(v ?? "").replace(/r\$/i, "").replace(/\s/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // 1.250 = mil duzentos e cinquenta
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export const zoneLabel = (z: { name: string; cep_start: string | null; cep_end: string | null }) =>
  z.name || (z.cep_start ? (z.cep_start === z.cep_end ? fmtCep(z.cep_start) : `${fmtCep(z.cep_start)} a ${fmtCep(z.cep_end)}`) : "Faixa");

/** Faixa que contém o CEP (a primeira na ordem da tabela). */
export const findZone = (zones: Zone[], cep: string) =>
  zones.find((z) => z.cep_start && z.cep_end && z.cep_start <= cep && cep <= z.cep_end) || null;

/** Custo por distância: km × valor por km, nunca abaixo do mínimo. Sem valor por km cadastrado → null. */
export function kmCost(s: DeliverySettings | null | undefined, km: number) {
  if (!s?.km_price || !(km >= 0)) return null;
  const c = km * Number(s.km_price);
  return Math.round(Math.max(c, Number(s.min_cost || 0)) * 100) / 100;
}

/** O que a pessoa digitou no atalho: um CEP, "3 km" (ou "3,5"), ou um pedaço do nome do bairro. */
export function lookup(zones: Zone[], s: DeliverySettings | null, raw: string): Lookup | null {
  const q = raw.trim();
  if (!q) return null;
  const cep = cepDigits(q);
  if (cep && /^[\d.\-\s]+$/.test(q)) return { kind: "cep", cep, zone: findZone(zones, cep) };
  const km = q.match(/^(\d+(?:[.,]\d+)?)\s*(km)?$/i);
  if (km && (km[2] || !zones.length)) { const n = Number(km[1].replace(",", ".")); return { kind: "km", km: n, cost: kmCost(s, n) }; }
  const n = normalize(q);
  return { kind: "name", q, zones: zones.filter((z) => normalize(z.name).includes(n)).slice(0, 8) };
}

export function renderMessage(template: string | null | undefined, v: { local: string; valor: string; cep?: string; km?: string }) {
  return (template || DEFAULT_MESSAGE).replace(/\{(local|valor|cep|km)\}/g, (_, k) => (v as any)[k] ?? "");
}

/**
 * Lê faixas de um texto ou de células de planilha. Cada linha vira uma faixa quando tem um valor e, de preferência,
 * um ou dois CEPs (um só = faixa de um CEP; nenhum = faixa só pelo nome). Linhas com "km" ajustam o valor por km
 * ("R$ 2,00 por km") ou o mínimo ("mínimo R$ 5,00"). Linhas sem valor (cabeçalhos, títulos) são ignoradas.
 */
export function extractFromRows(rows: unknown[][]): Parsed {
  const out: Parsed = { zones: [], km_price: null, min_cost: null, ignored: 0 };
  for (const r of rows) {
    const cells = (r || []).map((c) => String(c ?? "").trim()).filter(Boolean);
    if (!cells.length) continue;
    const line = cells.join("  ");
    const ceps = cepsIn(line);
    // tira os CEPs (e o "a"/"até"/traço entre eles) para sobrar o nome e o valor
    let rest = line.replace(CEP_RE, "\u00a7").replace(/\u00a7\s*(?:a|até|ate|ao|-|–|—|\/)?\s*\u00a7/gi, " ").replace(/\u00a7/g, " ");
    const val = pickMoney(rest);
    if (val == null) { out.ignored++; continue; } // cabeçalho, título, linha em branco
    if (!ceps.length && /\bkm\b/i.test(rest)) {
      if (/m[ií]nim/i.test(rest)) out.min_cost = val;
      else if (/(por|cada|\/)\s*km/i.test(rest)) out.km_price = val;
      else out.ignored++; // faixas por km ("até 3 km") não entram: o custo por distância é por km
      continue;
    }
    if (!ceps.length && /m[ií]nim/i.test(rest)) { out.min_cost = val; continue; }
    const tok = lastMoneyToken(rest) || "";
    if (!ceps.length && !/r\$|,\d{2}$/i.test(tok)) { out.ignored++; continue; } // sem CEP, só vale com R$ ou centavos ("Total: 5" não é faixa)
    rest = rest.replace(tok, " ");
    const name = rest.replace(/r\$/gi, " ").replace(/\b(cep|ceps|valor|taxa|frete)\b/gi, " ").replace(/[|;:\-–—_/\\()[\]"'*]+/g, " ").replace(/\s+/g, " ").trim();
    if (!ceps.length && !name) { out.ignored++; continue; }
    const [a, b] = ceps.length > 1 ? [ceps[0], ceps[1]].sort() : [ceps[0] || null, ceps[0] || null];
    out.zones.push({ name: name.slice(0, 80), cep_start: a, cep_end: b, cost: val });
    if (out.zones.length >= MAX_ZONES) break;
  }
  return out;
}

export function extractFromText(text: string): Parsed {
  const rows = text.split(/\r?\n/).map((l) => l.split(/[\t;|]| {2,}/)).filter((r) => r.some((c) => c.trim()));
  return extractFromRows(rows);
}

function lastMoneyToken(s: string) {
  const all = [...s.matchAll(MONEY_RE)].map((m) => m[0]);
  const strong = all.filter((t) => /r\$|,\d{2}$/i.test(t));
  return (strong.length ? strong : all).pop() || null;
}
const pickMoney = (s: string) => { const t = lastMoneyToken(s); return t ? parseMoney(t) : null; };

/** Limpa uma faixa vinda da tela ou da importação; devolve o erro em português ou a faixa pronta para gravar. */
export function cleanZone(z: Partial<ParsedZone>): { ok: ParsedZone } | { error: string } {
  const name = String(z.name ?? "").trim().slice(0, 80);
  const a = String(z.cep_start ?? "").trim(), b = String(z.cep_end ?? "").trim();
  let cep_start = a ? cepDigits(a) : null, cep_end = b ? cepDigits(b) : cep_start;
  if ((a && !cep_start) || (b && !cep_end)) return { error: "CEP precisa ter 8 dígitos (ex.: 90000-000)" };
  if (!cep_start && cep_end) cep_start = cep_end;
  if (!name && !cep_start) return { error: "Informe o nome da faixa ou o CEP" };
  const cost = parseMoney(z.cost);
  if (cost == null) return { error: "Informe o valor (ex.: 7,50)" };
  const [s, e] = cep_start && cep_end && cep_start > cep_end ? [cep_end, cep_start] : [cep_start, cep_end];
  return { ok: { name, cep_start: s, cep_end: e, cost } };
}
