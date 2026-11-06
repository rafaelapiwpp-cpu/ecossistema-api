import "../portal.css";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import Nav, { Icon, NavToggle, ThemeToggle, type NavLink } from "@/components/Nav";
import ScrollTitle from "@/components/ScrollTitle";
import { hasDb } from "@/lib/db";
import { getSession } from "@/lib/guard";
import { companyBySlug } from "@/lib/access";
import { isClient, isManagerRole } from "@/lib/roles";
import { companyThemeCss, hasFeature, logoSrc, safeHex } from "@/lib/companies";

export const dynamic = "force-dynamic";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

/** Aba do navegador com o nome e o logo da empresa (não do HUB). */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const company = hasDb() ? await companyBySlug(slug) : null;
  if (!company) return {};
  const logo = logoSrc(company);
  return {
    title: { default: company.name, template: `%s · ${company.name}` },
    description: company.tagline || `Atendimento pelo WhatsApp de ${company.name}`,
    icons: logo ? { icon: [{ url: logo }], apple: logo } : undefined,
    appleWebApp: { capable: true, title: company.name, statusBarStyle: "default" },
  };
}

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const { slug } = await params;
  const company = hasDb() ? await companyBySlug(slug) : null;
  return { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: company ? safeHex(company.primary_color) : "#f2f2f7" };
}

/**
 * Portal de clientes: casca própria com a marca da empresa (nome, logo, slogan e cores) e menu enxuto.
 * Entram aqui: usuários-cliente da própria empresa e, para acompanhar, a equipe interna com acesso de gestor ou acima.
 */
export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!hasDb()) notFound();
  const company = await companyBySlug(slug);
  if (!company) notFound();

  const session = await getSession();
  if (!session) redirect(`/${company.slug}/login`);
  const user = session.user;
  if (user.must_change_password) redirect("/trocar-senha");
  if (isClient(user.role)) {
    if (user.company_id !== company.id) redirect(`/${company.slug}/login`); // cliente de outra empresa não entra aqui
  } else if (!isManagerRole(user.role)) {
    redirect("/"); // atendente interno não acompanha portais
  }

  const base = `/${company.slug}`;
  const links: NavLink[] = [
    { href: base, label: "Início", icon: "home", exact: true },
    { href: `${base}/atendimento`, label: "Atendimento", icon: "chat", full: true },
    { href: `${base}/contatos`, label: "Contatos", icon: "contacts" },
    { href: `${base}/funil`, label: "Funil", icon: "leads" },
    ...(hasFeature(company, "teleentrega") ? [{ href: `${base}/teleentrega`, label: "Tele-entrega", icon: "delivery" }] : []),
    { href: `${base}/ajustes`, label: "Ajustes", icon: "settings" },
  ];
  const navUser = { name: user.name, role: user.role, roleLabel: isClient(user.role) ? company.name : "Equipe" };
  const logo = logoSrc(company);
  const brand = logo
    ? <img className="pb-logo" src={logo} alt="" />
    : <span className="pb-mark" aria-hidden>{initials(company.name)}</span>;

  return (
    <div className="shell portal" data-cat={`${user.id}.c${company.id}`} data-company={company.slug} data-company-name={company.name} data-logo={logo || ""}>
      <style dangerouslySetInnerHTML={{ __html: companyThemeCss(company.primary_color, company.secondary_color) }} />
      <aside className="side">
        <div className="brand pb">
          <Link className="pb-link" href={base} title={company.name}>
            <span className="pb-tile">{brand}</span>
            <span className="pb-text"><b className="pb-name">{company.name}</b><span className="pb-tag">{company.tagline || "Portal de atendimento"}</span></span>
          </Link>
          <NavToggle />
        </div>
        <Suspense><Nav links={links} user={navUser} canLogout company={company.slug} prefetch /></Suspense>
        <div className="side-foot">
          <div className="side-user"><span className="avatar">{initials(user.name)}</span><div><b>{user.name}</b><span>{navUser.roleLabel}</span></div></div>
          <div className="side-tools">
            <ThemeToggle />
            <form action="/api/logout" method="post"><input type="hidden" name="company" value={company.slug} /><button className="btn side-logout" title="Sair" aria-label="Sair"><Icon name="logout" size={17} className="" /></button></form>
          </div>
        </div>
      </aside>
      <main className="main">
        {/* celular: a marca fica numa faixa no topo (o menu vira a barra de abas embaixo) */}
        <div className="pb-top">
          <Link className="pb-link" href={base}><span className="pb-tile">{brand}</span><span className="pb-text"><b className="pb-name">{company.name}</b><span className="pb-tag">{company.tagline || "Portal de atendimento"}</span></span></Link>
          <span className="avatar pb-top-user" title={user.name}>{initials(user.name)}</span>
        </div>
        {children}
      </main>
      <Suspense><ScrollTitle /></Suspense>
    </div>
  );
}
