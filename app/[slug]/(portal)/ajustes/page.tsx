import PortalSettings from "@/components/PortalSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ajustes" };

export default async function PortalAjustes({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <div className="topbar"><div className="title"><h1>Ajustes</h1><p>Automações, etiquetas, departamentos, respostas rápidas e a sua conta</p></div></div>
      <PortalSettings company={slug} />
    </>
  );
}
