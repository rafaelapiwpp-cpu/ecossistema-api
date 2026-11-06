import { notFound } from "next/navigation";
import Delivery from "@/components/Delivery";
import { hasDb } from "@/lib/db";
import { companyBySlug } from "@/lib/access";
import { hasFeature } from "@/lib/companies";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tele-entrega" };

/** Teleentrega da empresa: faixas de CEP, custo por km e consulta rápida. Só aparece com o recurso ligado (Configurações → Empresas). */
export default async function PortalTeleentrega({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = hasDb() ? await companyBySlug(slug) : null;
  if (!company || !hasFeature(company, "teleentrega")) notFound();
  return (
    <>
      <div className="topbar"><div className="title"><h1>Tele-entrega</h1><p>Faixas de CEP, custo por quilômetro e a consulta que o atendimento usa</p></div></div>
      <Delivery company={slug} />
    </>
  );
}
