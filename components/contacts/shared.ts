// Tipos e utilidades das telas Contatos e Leads (lado do navegador).

export type Catalog = {
  departments: { id: number; name: string; color?: string | null; company_id?: number | null }[];
  tags: { id: number; name: string; color: string | null; company_id?: number | null }[];
  lists: { id: number; name: string; total: number; waba_id?: string | null }[];
  wabas: { id: string; name: string | null }[];
  me: { role: string };
};

export type Row = {
  id: number; waba_id: string; phone: string; name: string | null; email: string | null; fields: Record<string, any>; department_id: number | null; opt_out: boolean;
  source: string | null; notes: string | null; department_name: string | null; waba_name: string | null; conversation_id: number | null; updated_at: string; created_at: string;
  last_inbound_at: string | null; tags: { id: number; name: string; color: string | null }[]; lists: { id: number; name: string }[];
};

export type Filters = { q: string; waba: string; source: string; tag: string; list: string; department: string; replied: string; recent: string; optout: string };
export const EMPTY_FILTERS: Filters = { q: "", waba: "", source: "", tag: "", list: "", department: "", replied: "", recent: "", optout: "" };

/** Filtros a partir de um endereço (?list=3&tag=2…) — os links "Ver os leads" abrem a tela já filtrada. */
export function filtersFrom(search: string, base: Partial<Filters> = {}): Filters {
  const p = new URLSearchParams(search);
  const f: Filters = { ...EMPTY_FILTERS, ...base };
  for (const k of Object.keys(EMPTY_FILTERS) as (keyof Filters)[]) { const v = p.get(k); if (v) f[k] = v; }
  return f;
}

export const filterQuery = (f: Partial<Filters>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) q.set(k, String(v));
  return q;
};

export async function api(url: string, body?: any) {
  const r = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export const fmtPhone = (p: string) =>
  p.length === 13 && p.startsWith("55") ? `+55 ${p.slice(2, 4)} ${p.slice(4, 9)}-${p.slice(9)}`
    : p.length === 12 && p.startsWith("55") ? `+55 ${p.slice(2, 4)} ${p.slice(4, 8)}-${p.slice(8)}` : `+${p}`;

/** Como o contato chegou no HUB. */
export const SOURCE_LABEL: Record<string, string> = {
  whatsapp: "Conversa", celular: "Celular (app)", externo: "Outra ferramenta", disparo: "Disparo", fluxo: "Fluxo",
  teste: "Teste de fluxo", manual: "Cadastro manual", importacao: "Importação",
};
/** Grupos do filtro "Origem" (os mesmos de lib/contact-filters.ts). */
export const SOURCE_FILTER: [string, string][] = [
  ["organico", "Conversa (orgânico)"], ["importacao", "Importação (planilha)"], ["automacao", "Disparo ou fluxo"], ["externo", "Outra ferramenta"], ["manual", "Cadastro manual"],
];

/** "hoje", "ontem", "há 5 dias", "12/08/2026". */
export function ago(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso), now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days <= 0) return `hoje, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  return d.toLocaleDateString("pt-BR");
}

export const nf = (n: number) => n.toLocaleString("pt-BR");
