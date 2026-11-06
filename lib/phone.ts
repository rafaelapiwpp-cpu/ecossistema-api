// Normalização de telefones para o formato internacional só com dígitos (ex.: 5585999990001). Sem acesso a banco.

/** Devolve o número normalizado ou "" quando não dá para usar. `ddi` é adicionado a números com DDD + número. */
export function normalizePhone(raw: string | number | null | undefined, ddi = "55"): string {
  let p = String(raw ?? "").replace(/\D/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = p.slice(2); // discagem internacional manual
  if (p.length === 11 && p.startsWith("0") && ddi === "55") p = p.slice(1); // 0 + DDD + número fixo (10 dígitos)
  if (p.length === 12 && p.startsWith("0") && ddi === "55") p = p.slice(1); // 0 + DDD + celular (11 dígitos)
  if (ddi === "55") {
    if (p.length === 10 || p.length === 11) p = ddi + p; // DDD + número, sem DDI
  } else if (p.length >= 8 && p.length <= 11 && !p.startsWith(ddi)) p = ddi + p;
  return p.length >= 10 && p.length <= 15 ? p : "";
}

/** +55 85 99999-0001 (ou +<número> para outros países). */
export function formatPhone(p: string) {
  if (p.length === 13 && p.startsWith("55")) return `+55 ${p.slice(2, 4)} ${p.slice(4, 9)}-${p.slice(9)}`;
  if (p.length === 12 && p.startsWith("55")) return `+55 ${p.slice(2, 4)} ${p.slice(4, 8)}-${p.slice(8)}`;
  return `+${p}`;
}
