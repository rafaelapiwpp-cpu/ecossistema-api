import "../portal.css";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { hasDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { companyBySlug } from "@/lib/access";
import { companyThemeCss, logoSrc } from "@/lib/companies";

export const dynamic = "force-dynamic";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const company = hasDb() ? await companyBySlug(slug) : null;
  if (!company) return {};
  const logo = logoSrc(company);
  return { title: `Entrar · ${company.name}`, icons: logo ? { icon: [{ url: logo }], apple: logo } : undefined };
}

/** Login do portal de uma empresa: mesma tela do HUB, com o logo, o nome, o slogan e as cores da empresa. */
export default async function PortalLogin({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ erro?: string }> }) {
  if (!hasDb()) redirect("/");
  if (!(await getSettings())) redirect("/setup");
  const { slug } = await params;
  const company = await companyBySlug(slug);
  if (!company) notFound();
  const sp = await searchParams;
  const logo = logoSrc(company);
  return (
    <div className="login portal portal-login">
      <style dangerouslySetInnerHTML={{ __html: companyThemeCss(company.primary_color, company.secondary_color) }} />
      {/* nada da sessão anterior fica no navegador (catálogo em cache etc.) */}
      <script dangerouslySetInnerHTML={{ __html: "try{for(var k in sessionStorage)if(k.indexOf('hub.')===0)sessionStorage.removeItem(k)}catch(e){}" }} />
      <form action="/api/login" method="post">
        <input type="hidden" name="company" value={company.slug} />
        <div className="login-brand portal-brand">
          <span className="pl-tile">{logo ? <img src={logo} alt={company.name} /> : <b aria-hidden>{initials(company.name)}</b>}</span>
          <b className="pl-name">{company.name}</b>
          <span className="pl-tag">{company.tagline || "Portal de atendimento pelo WhatsApp"}</span>
        </div>
        <h1>Entrar</h1>
        <label className="field"><span>E-mail</span><input type="email" name="login" placeholder="voce@empresa.com" required autoFocus autoComplete="username" /></label>
        <label className="field"><span>Senha</span><input type="password" name="password" required autoComplete="current-password" /></label>
        {sp.erro && <div className="err">E-mail ou senha incorretos</div>}
        <button className="btn primary" type="submit" style={{ justifyContent: "center" }}>Entrar</button>
        <div className="login-links"><a href="/esqueci-senha">Esqueci minha senha</a></div>
      </form>
    </div>
  );
}
