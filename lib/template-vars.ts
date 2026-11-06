// Variáveis de template ({{1}} / {{nome}}): funções puras, usadas no servidor e nas telas.
export type ParamSource = { key: string; kind: "field" | "text"; value: string; fallback?: string };
export type Mapping = {
  header?: { kind: "text"; source: ParamSource } | { kind: "image" | "video" | "document"; media_id: string; filename?: string | null } | null;
  body: ParamSource[];
  buttons?: { index: number; sub_type: "url" | "copy_code"; source: ParamSource }[];
};
// ---------- variáveis do contato dentro de textos ({{nome}}, {{primeiro_nome}}…) ----------

export type TokenContact = { name?: string | null; phone: string; email?: string | null; fields?: Record<string, any> | null };

/** Troca {{nome}}, {{primeiro_nome}}, {{telefone}}, {{email}}, {{resposta}} e {{campo.x}} pelos dados do contato. */
export function fillTokens(text: string, c: TokenContact, vars: Record<string, any> = {}) {
  return String(text || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const k = key.toLowerCase();
    if (k === "nome" || k === "name") return c.name || "";
    if (k === "primeiro_nome" || k === "first_name") return (c.name || "").trim().split(/\s+/)[0] || "";
    if (k === "telefone" || k === "phone") return c.phone;
    if (k === "email") return c.email || "";
    if (k === "resposta" || k === "reply") return String(vars.last_reply ?? "");
    if (k.startsWith("campo.") || k.startsWith("fields.")) return String(c.fields?.[key.slice(key.indexOf(".") + 1)] ?? "");
    return String(vars[key] ?? c.fields?.[key] ?? "");
  });
}

/** Valor de campo do mapeamento ("first_name", "fields.cidade"…) ↔ variável de texto ("primeiro_nome", "campo.cidade"…). */
export function tokenOfField(value: string) {
  if (value === "name") return "nome";
  if (value === "first_name") return "primeiro_nome";
  if (value === "phone") return "telefone";
  if (value === "email") return "email";
  if (value.startsWith("fields.")) return `campo.${value.slice(7)}`;
  return value;
}
export function fieldOfToken(token: string) {
  const k = token.trim().toLowerCase();
  if (k === "nome" || k === "name") return "name";
  if (k === "primeiro_nome" || k === "first_name") return "first_name";
  if (k === "telefone" || k === "phone") return "phone";
  if (k === "email") return "email";
  if (k.startsWith("campo.")) return `fields.${token.trim().slice(6)}`;
  return null;
}

// ---------- template: variáveis ----------

export type Placeholders = {
  header: { kind: "text" | "image" | "video" | "document" | "location" | "none"; keys: string[] };
  body: string[];
  buttons: { index: number; sub_type: "url" | "copy_code"; text: string }[];
  named: boolean;
};

/** Lista as variáveis ({{1}} ou {{nome}}) de cada parte do template. */
export function placeholdersOf(components: any[] | null | undefined): Placeholders {
  const keysOf = (text: string) => { const out: string[] = []; for (const m of (text || "").matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1]); return out; };
  const header = (components || []).find((c) => c?.type === "HEADER");
  const body = (components || []).find((c) => c?.type === "BODY");
  const buttons = ((components || []).find((c) => c?.type === "BUTTONS")?.buttons || []) as any[];
  const hk = header ? String(header.format || "TEXT").toLowerCase() : "none";
  const bodyKeys = keysOf(body?.text || "");
  return {
    header: { kind: (hk as any) || "none", keys: hk === "text" ? keysOf(header?.text || "") : [] },
    body: bodyKeys,
    buttons: buttons.map((b, index) => ({ b, index })).filter(({ b }) => (b.type === "URL" && /\{\{\s*\w+\s*\}\}/.test(b.url || "")) || b.type === "COPY_CODE")
      .map(({ b, index }) => ({ index, sub_type: b.type === "URL" ? "url" as const : "copy_code" as const, text: b.text || b.type })),
    named: bodyKeys.some((k) => !/^\d+$/.test(k)),
  };
}

/** Texto limpo para parâmetro de template (a Meta recusa quebras de linha e mais de 4 espaços seguidos). */
function cleanParam(v: any) {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 1024);
}

export function resolveSource(src: ParamSource, c: { name?: string | null; phone: string; email?: string | null; fields?: Record<string, any> | null }): string {
  if (src.kind === "text") return cleanParam(fillTokens(src.value, c)); // texto fixo, com {{nome}}, {{primeiro_nome}}… trocados pelo contato
  let v: any = "";
  if (src.value === "name") v = c.name;
  else if (src.value === "first_name") v = (c.name || "").trim().split(/\s+/)[0];
  else if (src.value === "phone") v = c.phone;
  else if (src.value === "email") v = c.email;
  else if (src.value.startsWith("fields.")) v = c.fields?.[src.value.slice(7)];
  const out = cleanParam(v);
  return out || cleanParam(src.fallback || "");
}

/** Monta os componentes da mensagem de template para um destinatário. Devolve null se faltar alguma variável. */
export function buildComponents(ph: Placeholders, mapping: Mapping, c: { name?: string | null; phone: string; email?: string | null; fields?: Record<string, any> | null }) {
  const components: any[] = [];
  const values: Record<string, string> = {};
  const missing: string[] = [];
  const param = (key: string, text: string) => (ph.named ? { type: "text", parameter_name: key, text } : { type: "text", text });

  if (mapping.header && mapping.header.kind !== "text") {
    const h = mapping.header;
    const media: any = { id: h.media_id };
    if (h.kind === "document" && h.filename) media.filename = h.filename;
    components.push({ type: "header", parameters: [{ type: h.kind, [h.kind]: media }] });
  } else if (mapping.header?.kind === "text" && ph.header.keys.length) {
    const text = resolveSource(mapping.header.source, c);
    if (!text) missing.push("cabeçalho");
    components.push({ type: "header", parameters: [param(ph.header.keys[0], text)] });
  }
  if (ph.body.length) {
    const params = ph.body.map((key) => {
      const src = mapping.body.find((b) => b.key === key);
      const text = src ? resolveSource(src, c) : "";
      if (!text) missing.push(`{{${key}}}`);
      values[key] = text;
      return param(key, text);
    });
    components.push({ type: "body", parameters: params });
  }
  for (const b of ph.buttons) {
    const m = (mapping.buttons || []).find((x) => x.index === b.index);
    const text = m ? resolveSource(m.source, c) : "";
    if (!text) { missing.push(`botão ${b.text}`); continue; }
    components.push(b.sub_type === "url"
      ? { type: "button", sub_type: "url", index: b.index, parameters: [{ type: "text", text }] }
      : { type: "button", sub_type: "copy_code", index: b.index, parameters: [{ type: "coupon_code", coupon_code: text }] });
  }
  return { components, values, missing };
}

/** Prévia do corpo do template para um contato (ou com exemplos). */
export function previewFor(components: any[] | null | undefined, ph: Placeholders, mapping: Mapping, c: { name?: string | null; phone: string; email?: string | null; fields?: Record<string, any> | null }) {
  const body = (components || []).find((x: any) => x?.type === "BODY")?.text || "";
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_: string, key: string) => {
    const src = mapping.body.find((b) => b.key === key);
    return (src && resolveSource(src, c)) || `{{${key}}}`;
  });
}

