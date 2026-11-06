"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type NavLink = { href: string; label: string; icon: string; full?: boolean; admin?: boolean; manager?: boolean; exact?: boolean };

const LINKS: NavLink[] = [
  { href: "/", label: "Visão geral", icon: "home" },
  { href: "/atendimento", label: "Atendimento", icon: "chat", full: true },
  { href: "/disparos", label: "Disparos", icon: "send" },
  { href: "/fluxos", label: "Fluxos", icon: "flow" },
  { href: "/leads", label: "Leads", icon: "leads" },
  { href: "/contatos", label: "Contatos", icon: "contacts" },
  { href: "/templates", label: "Templates", icon: "template" },
  { href: "/conexoes", label: "Conexões", icon: "plug", manager: true },
  { href: "/falhas", label: "Falhas de envio", icon: "alert" },
  { href: "/equipe", label: "Equipe", icon: "team", admin: true },
  { href: "/configuracoes", label: "Configurações", icon: "settings", admin: true },
];

/** Ícones de traço fino (estilo SF Symbols), 24×24. */
const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10" />,
  delivery: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9z" /><path d="M3 7.5 12 12l9-4.5M12 12v9M7.5 5.3l9 4.5" /></>,
  chat: <path d="M4 5h16v11H8l-4 4V5z" />,
  send: <path d="M3 12 21 4l-6 17-3-7-9-2z" />,
  robot: <><rect x="4.5" y="8" width="15" height="11" rx="3.5" /><path d="M12 4.5V8M9.5 13v1M14.5 13v1M2.5 12.5v2.5M21.5 12.5v2.5" /><circle cx="12" cy="3.6" r="1" /></>,
  flow: <><rect x="3" y="4" width="6" height="5" rx="1.5" /><rect x="15" y="4" width="6" height="5" rx="1.5" /><rect x="9" y="15" width="6" height="5" rx="1.5" /><path d="M6 9v3h12V9M12 12v3" /></>,
  leads: <><path d="M4 5h16v4H4zM4 11h16M4 15h10" /><path d="M17 15l2 2 3-3" /></>,
  contacts: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .8 3 2.6 3 6" /></>,
  template: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  alert: <><path d="M12 3 2 21h20L12 3z" /><path d="M12 10v5M12 18h.01" /></>,
  team: <><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M2 20c0-3 2.7-5 6-5s6 2 6 5M12 20c0-3 1.8-5 4-5s6 2 6 5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  more: <><circle cx="12" cy="12" r="9" /><path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="2.6" /></>,
  logout: <><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" /><path d="M14 8l4 4-4 4M18 12H9" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  auto: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor" stroke="none" /></>,
  person: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" /></>,
  paperclip: <path d="M20 11.5 11.6 20a5 5 0 0 1-7-7l8.8-8.8a3.3 3.3 0 0 1 4.7 4.7L9.3 17.7a1.7 1.7 0 0 1-2.4-2.4L14.6 7.6" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 13h6M9 17h6" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.8" /><path d="m21 16-5-5-9 9" /></>,
  video: <><rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="m15.5 10.5 6-3.5v10l-6-3.5" /></>,
  audio: <><path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  up: <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" strokeWidth="2.4" />,
  sparkles: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M5 17l.8 2.2L8 20l-2.2.8L5 23l-.8-2.2L2 20l2.2-.8L5 17z" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  back: <path d="M15 5l-7 7 7 7" strokeWidth="2.2" />,
  close: <path d="M6 6l12 12M18 6 6 18" strokeWidth="2.2" />,
  pin: <><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth="2.4" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" strokeWidth="2.2" />,
  plug: <><path d="M9 3v5M15 3v5" /><path d="M6 8h12v3a6 6 0 0 1-12 0V8z" /><path d="M12 17v4" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5" /><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.3c1.8.8 3 2.7 3 5.2" /></>,
  layers: <><path d="M12 3 3 8l9 5 9-5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  trash: <><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  filter: <path d="M4 6.5h16M7 12h10M10 17.5h4" />,
  tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.3" /></>,
  sidebar: <><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M15 4.5v15" /></>,
};

export function Icon({ name, size = 18, className = "nav-ico" }: { name: string; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[name]}</svg>;
}

const KEY = "hub.nav";
const THEME_KEY = "hub.theme";
type Theme = "auto" | "light" | "dark";

/** Botão que recolhe/expande o menu lateral (estado guardado no navegador). */
export function NavToggle() {
  const [min, setMin] = useState(false);
  useEffect(() => {
    // acompanha mudanças feitas por outras telas (ex.: Fluxos recolhe o menu enquanto está aberta)
    const html = document.documentElement;
    const sync = () => setMin(html.classList.contains("nav-min"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  const toggle = () => {
    const next = !min; setMin(next);
    const html = document.documentElement;
    html.classList.toggle("nav-min", next);
    delete html.dataset.autoMin; // escolha da pessoa: vale também depois de sair de Fluxos
    try { localStorage.setItem(KEY, next ? "min" : "full"); } catch { /* ignorado */ }
  };
  return (
    <button className="nav-toggle" onClick={toggle} title={min ? "Expandir menu" : "Recolher menu"} aria-label={min ? "Expandir menu" : "Recolher menu"}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{min ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}</svg>
    </button>
  );
}

/** Aparência: clara (padrão), escura ou automática (segue o sistema) — a escolha fica guardada no navegador. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { /* ignorado */ }
    setTheme(saved === "dark" ? "dark" : saved === "auto" ? "auto" : "light");
  }, []);
  const pick = (t: Theme) => {
    setTheme(t);
    const root = document.documentElement;
    root.classList.add("theming"); window.setTimeout(() => root.classList.remove("theming"), 400);
    if (t === "auto") delete root.dataset.theme; else root.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch { /* ignorado */ }
  };
  const opts: [Theme, string, string][] = [["light", "sun", "Claro"], ["dark", "moon", "Escuro"], ["auto", "auto", "Automático (segue o sistema)"]];
  return (
    <div className="theme-seg" role="group" aria-label="Aparência">
      {opts.map(([t, icon, label]) => (
        <button key={t} type="button" className={theme === t ? "on" : ""} onClick={() => pick(t)} title={label} aria-label={label} aria-pressed={theme === t}>
          <Icon name={icon} size={15} className="" />
        </button>
      ))}
    </div>
  );
}

export type HubView = "all" | "mine" | "team";
const VIEWS: [HubView, string, string, string][] = [
  ["all", "Tudo", "layers", "Todas as BMs"],
  ["mine", "Minha BM", "lock", "Só as BMs privadas do Master"],
  ["team", "Equipe", "users", "O que a equipe vê"],
];

/** Visão do Master: Tudo · Minha BM · Equipe (cookie no servidor; recarrega a tela para nada ficar misturado). */
export function ViewSwitch({ view }: { view: HubView }) {
  const [busy, setBusy] = useState<HubView | null>(null);
  const pick = async (v: HubView) => {
    if (v === view || busy) return;
    setBusy(v);
    try {
      const r = await fetch("/api/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ view: v }) });
      if (!r.ok) throw new Error();
      window.location.reload();
    } catch { setBusy(null); }
  };
  return (
    <div className="view-switch" role="group" aria-label="Visão do Master">
      <span className="view-cap"><Icon name="lock" size={12} className="" />Visão do Master</span>
      <div className="view-seg">
        {VIEWS.map(([v, label, icon, tip]) => (
          <button key={v} type="button" className={(busy ?? view) === v ? "on" : ""} onClick={() => pick(v)} title={tip} aria-pressed={view === v} disabled={!!busy}>
            <Icon name={icon} size={14} className="" /><span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type User = { name: string; role: string; roleLabel: string } | null;

export default function Nav({ admin = true, manager = true, user = null, canLogout = false, view = null, links: custom, company = null, prefetch = false }: {
  admin?: boolean; manager?: boolean; user?: User; canLogout?: boolean; view?: HubView | null;
  /** Portal de clientes: menu próprio (Atendimento, Contatos, Funil…) */
  links?: NavLink[];
  /** Portal: endereço da empresa, para o "Sair" voltar ao login dela */
  company?: string | null;
  /** Pré-carrega as páginas do menu (troca de tela instantânea) — usado no portal, onde as páginas são leves */
  prefetch?: boolean;
}) {
  const path = usePathname();
  const sp = useSearchParams();
  const [more, setMore] = useState(false);
  const keep = new URLSearchParams();
  for (const k of ["p", "waba"]) if (sp.get(k)) keep.set(k, sp.get(k)!);
  const qs = keep.toString();
  const keepQs = new Set(["/", "/templates", "/falhas"]);
  const links = (custom || LINKS).filter((l) => (!l.admin || admin) && (!l.manager || manager));
  const isActive = (l: { href: string; exact?: boolean }) => path === l.href || (!l.exact && l.href !== "/" && path.startsWith(l.href + "/"));
  const hrefOf = (href: string) => (qs && keepQs.has(href) ? `${href}?${qs}` : href);
  useEffect(() => { setMore(false); }, [path]);
  const moreActive = links.slice(4).some((l) => isActive(l));
  const initials = user ? user.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") : "";
  return (
    <nav className="nav">
      {links.map((l) => (
        <Link key={l.href} href={hrefOf(l.href)} title={l.label} className={isActive(l) ? "active" : ""} prefetch={prefetch || (l.href === "/atendimento" ? true : undefined)}>
          <Icon name={l.icon} /><span className="nav-label">{l.label}</span>
        </Link>
      ))}
      <button type="button" className={`nav-more ${moreActive || more ? "active" : ""}`} onClick={() => setMore(!more)} aria-expanded={more} aria-label="Mais opções do menu">
        <Icon name="more" /><span className="nav-label">Mais</span>
      </button>
      {more && typeof document !== "undefined" && createPortal(
        <>
          <div className="nav-back" onClick={() => setMore(false)} aria-hidden />
          <div className="nav-sheet" role="dialog" aria-label="Mais opções">
            {user && (
              <div className="sheet-user">
                <span className="avatar">{initials}</span>
                <div><b>{user.name}</b><span className={user.role === "master" ? "role-master" : ""}>{user.roleLabel}</span></div>
              </div>
            )}
            {view && <ViewSwitch view={view} />}
            {links.slice(4).map((l) => (
              <Link key={l.href} href={hrefOf(l.href)} className={isActive(l) ? "active" : ""} onClick={() => setMore(false)}>
                <Icon name={l.icon} size={22} /><span className="nav-label">{l.label}</span>
              </Link>
            ))}
            <div className="sheet-tools">
              <ThemeToggle />
              {canLogout && <form action="/api/logout" method="post" onSubmit={() => { try { sessionStorage.clear(); } catch { /* bloqueado */ } }}>{company && <input type="hidden" name="company" value={company} />}<button className="btn side-logout" title="Sair"><Icon name="logout" size={17} className="" />Sair</button></form>}
            </div>
          </div>
        </>, document.body)}
    </nav>
  );
}
