// Regras compartilhadas do portal de clientes (empresas): endereço (slug), cores, logo e funil padrão.
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const HEX_RE = /^#[0-9a-f]{6}$/i;
// endereços que já são do painel: uma empresa não pode usar como slug
export const RESERVED_SLUGS = new Set(["login", "setup", "api", "atendimento", "disparos", "fluxos", "leads", "contatos", "templates", "conexoes", "falhas", "equipe", "configuracoes", "contas", "privacidade", "termos", "exclusao-de-dados", "esqueci-senha", "trocar-senha", "_next", "favicon.ico", "icon.png", "admin", "master", "hub", "app", "www", "logo", "sobre"]);

export const DEFAULT_STAGES = [
  { name: "Novo", color: "#3987e5", kind: "open" },
  { name: "Em contato", color: "#8b7cf6", kind: "open" },
  { name: "Negociando", color: "#c98500", kind: "open" },
  { name: "Fechado", color: "#199e70", kind: "won" },
  { name: "Perdido", color: "#d95926", kind: "lost" },
];

/** Padrões aplicados a toda empresa nova (editáveis em Configurações → Empresas). */
export type CompanyDefaults = {
  stages: { name: string; color: string; kind: "open" | "won" | "lost" }[];
  quick_replies: { title: string; body: string; shortcut: string }[];
  departments: string[];
};
export const DEFAULT_QUICK_REPLIES: CompanyDefaults["quick_replies"] = [
  { title: "Saudação", body: "{{saudacao}}, {{primeiro_nome}}! Aqui é {{atendente}}, da {{empresa}}. Como posso ajudar?", shortcut: "oi" },
  { title: "Aguarde um instante", body: "Só um instante, {{primeiro_nome}}, já verifico para você.", shortcut: "aguarde" },
  { title: "Encerramento", body: "Qualquer coisa é só chamar, {{primeiro_nome}}. A {{empresa}} agradece!", shortcut: "tchau" },
];
export const FALLBACK_DEFAULTS: CompanyDefaults = { stages: DEFAULT_STAGES as CompanyDefaults["stages"], quick_replies: DEFAULT_QUICK_REPLIES, departments: [] };
/** Limpa o que veio da tela: nomes vazios somem, cores inválidas viram a padrão, no máximo 12 etapas / 20 respostas / 12 departamentos. */
export function cleanDefaults(v: any): CompanyDefaults {
  const stages = (Array.isArray(v?.stages) ? v.stages : []).map((x: any) => ({ name: String(x?.name || "").trim().slice(0, 40), color: HEX_RE.test(String(x?.color || "")) ? String(x.color).toLowerCase() : "#3987e5", kind: (["open", "won", "lost"].includes(x?.kind) ? x.kind : "open") as "open" | "won" | "lost" })).filter((x: any) => x.name).slice(0, 12);
  const quick_replies = (Array.isArray(v?.quick_replies) ? v.quick_replies : []).map((x: any) => ({ title: String(x?.title || "").trim().slice(0, 60), body: String(x?.body || "").trim().slice(0, 1000), shortcut: String(x?.shortcut || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) })).filter((x: any) => x.title && x.body).slice(0, 20);
  const departments: string[] = [];
  for (const x of Array.isArray(v?.departments) ? v.departments : []) { const n = String(x || "").trim().slice(0, 40); if (n && !departments.some((d) => d.toLowerCase() === n.toLowerCase())) departments.push(n); }
  return { stages: stages.length ? stages : FALLBACK_DEFAULTS.stages, quick_replies, departments: departments.slice(0, 12) };
}

/** Variáveis aceitas nas respostas rápidas (trocadas na hora de inserir na conversa). */
export const QUICK_VARS: { key: string; label: string }[] = [
  { key: "nome", label: "Nome do contato" },
  { key: "primeiro_nome", label: "Primeiro nome do contato" },
  { key: "telefone", label: "Telefone do contato" },
  { key: "atendente", label: "Seu nome" },
  { key: "empresa", label: "Nome da empresa" },
  { key: "saudacao", label: "Bom dia / Boa tarde / Boa noite" },
];

/**
 * Recursos que a equipe liga por empresa (Configurações → Empresas). Todo recurso novo nasce desligado: liga-se primeiro na
 * loja de homologação, valida-se e só depois nas empresas reais. Desligado, nada muda para a empresa.
 */
export const FEATURES: { key: string; label: string; help: string }[] = [
  { key: "teleentrega", label: "Tele-entrega", help: "Tela de faixas de CEP e custo por km no portal, e o atalho de consulta no Atendimento." },
];
export const hasFeature = (c: { features?: Record<string, boolean> | null } | null | undefined, key: string) => !!c?.features && c.features[key] === true;

/** "Farmácia São José" → "farmacia-sao-jose" */
export const slugify = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** Cor da empresa válida (#rrggbb) ou a padrão. */
export const safeHex = (v: string | null | undefined, fallback = "#6b3fe4") => (v && HEX_RE.test(v) ? v.toLowerCase() : fallback);

/** Luminância relativa (0 = preto, 1 = branco) de uma cor #rrggbb — decide se o texto sobre ela é branco ou escuro. */
export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

/** Endereço do logo para <img>/favicon: o arquivo enviado (data URL) é servido por /{slug}/logo com cache; um https fica como está. */
export function logoSrc(c: { slug: string; logo_url: string | null; updated_at?: string | null }) {
  if (!c.logo_url) return null;
  if (!c.logo_url.startsWith("data:")) return c.logo_url;
  const v = c.updated_at ? Math.floor(new Date(c.updated_at).getTime() / 1000) : 0; // muda o endereço quando o logo é trocado (cache)
  return `/${c.slug}/logo${v ? `?v=${v}` : ""}`;
}

/**
 * CSS do tema de uma empresa. A cor principal vira o acento do portal (botões, links, item ativo, balões enviados,
 * avatar, badges) e manda sozinha nas superfícies grandes (banner do Início, login, menu): o degradê da marca é
 * sempre do MESMO tom (mais claro → cor → mais escuro), porque misturar a principal com a secundária passa por um
 * meio-termo acinzentado/amarronzado que fica feio em paletas como verde + laranja. A secundária entra como
 * destaque pontual (gráficos, segunda variação dos avatares, selos). Cores claras recebem texto escuro e um acento
 * mais fechado para links; no modo escuro o acento clareia. Só cores já validadas (#rrggbb) entram no CSS.
 */
export function companyThemeCss(primary: string | null | undefined, secondary?: string | null) {
  const p = safeHex(primary);
  const s = safeHex(secondary, p);
  const light = luminance(p) > 0.42;
  const lightS = luminance(s) > 0.55;
  const ink = light ? "#1d1d1f" : "#ffffff";
  const accentText = light ? `color-mix(in srgb,${p} 55%,black)` : p;
  const base = [
    `--accent:${accentText}`, `--accent-fill:${p}`, `--accent-ink:${ink}`,
    `--accent-soft:color-mix(in srgb,${p} 13%,transparent)`, `--accent-ring:color-mix(in srgb,${p} 32%,transparent)`,
    `--brand-1:${p}`, `--brand-2:${s}`, `--brand-ink:${ink}`,
    `--brand-light:color-mix(in srgb,${p} 86%,white)`, `--brand-deep:color-mix(in srgb,${p} 80%,black)`,
    `--brand-grad:linear-gradient(118deg,color-mix(in srgb,${p} 82%,black) 0%,${p} 48%,color-mix(in srgb,${p} 88%,white) 100%)`,
    `--brand-glow:color-mix(in srgb,${p} 55%,transparent)`,
    // secundária legível sobre superfícies claras (texto, barras de gráfico) e um tom suave dela para fundos
    `--brand-2-text:${lightS ? `color-mix(in srgb,${s} 62%,black)` : s}`, `--brand-2-soft:color-mix(in srgb,${s} 14%,transparent)`,
    // secundária como destaque SOBRE a cor principal (uma palavra do título do banner): sempre mais clara que um fundo
    // escuro ou mais escura que um fundo claro, para nunca sumir — mesmo quando a secundária é igual à principal
    `--brand-2-on-brand:${light ? `color-mix(in srgb,${s} 70%,black)` : `color-mix(in srgb,${s} 84%,white)`}`,
  ].join(";");
  const darkAccent = light ? p : `color-mix(in srgb,${p} 68%,white)`;
  const dark = [
    `--accent:${darkAccent}`, `--accent-fill:${light ? p : `color-mix(in srgb,${p} 88%,white)`}`,
    `--accent-soft:color-mix(in srgb,${p} 24%,transparent)`, `--accent-ring:color-mix(in srgb,${p} 45%,transparent)`,
    `--brand-2-text:${lightS ? s : `color-mix(in srgb,${s} 72%,white)`}`, `--brand-2-soft:color-mix(in srgb,${s} 26%,transparent)`,
  ].join(";");
  return [
    `.portal{${base};}`,
    `:root[data-theme="dark"] .portal{${dark};}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .portal{${dark};}}`,
  ].join("\n");
}
