import { Suspense } from "react";
import { redirect } from "next/navigation";
import Nav, { Icon, NavToggle, ThemeToggle, ViewSwitch } from "@/components/Nav";
import ScrollTitle from "@/components/ScrollTitle";
import { BRAND } from "@/lib/brand";
import { hasDb } from "@/lib/db";
import { clientHome, requirePage } from "@/lib/guard";
import { ROLE_LABEL } from "@/lib/auth";
import { isAdminRole, isClient, isManagerRole, isMaster } from "@/lib/roles";
import { readView, type View } from "@/lib/access";

export const dynamic = "force-dynamic";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  let user: { id: number; name: string; role: string } | null = null;
  if (hasDb()) {
    const session = await requirePage({ client: true }); // redireciona para /setup ou /login quando preciso
    if (!session) redirect("/login");
    if (isClient(session.user.role)) redirect(await clientHome(session.user)); // cliente só vê o portal da empresa dele
    user = session.user;
  }
  const master = !!user && isMaster(user.role);
  // visão do Master (Tudo · Minha BM · Equipe); os demais sempre veem a da Equipe
  const view: View = master ? await readView() : "team";
  const navUser = user ? { name: user.name, role: user.role, roleLabel: ROLE_LABEL[user.role] || user.role } : null;
  return (
    // data-cat separa o cache local do catálogo por usuário e visão (lib/catalog-client.ts)
    <div className={`shell${master ? ` is-master view-${view}` : ""}`} data-cat={user ? `${user.id}.${view}` : "demo"}>
      <aside className="side">
        <div className="brand">
          <img className="brand-logo" src="/logo-icon.webp" alt="" width={28} height={28} />
          <span className="brand-name">{BRAND.name}</span>
          <NavToggle />
        </div>
        {master && <ViewSwitch view={view} />}
        <Suspense><Nav admin={!user || isAdminRole(user.role)} manager={!user || isManagerRole(user.role)} user={navUser} canLogout={hasDb()} view={master ? view : null} /></Suspense>
        <div className="side-foot">
          {user
            ? <div className="side-user"><span className="avatar">{initials(user.name)}</span><div><b>{user.name}</b><span className={master ? "role-master" : ""}>{ROLE_LABEL[user.role] || user.role}</span></div></div>
            : <div className="side-user"><span>API Oficial do WhatsApp</span></div>}
          <div className="side-tools">
            <ThemeToggle />
            {hasDb() && <form action="/api/logout" method="post"><button className="btn side-logout" title="Sair" aria-label="Sair"><Icon name="logout" size={17} className="" /></button></form>}
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
      <Suspense><ScrollTitle /></Suspense>
    </div>
  );
}
