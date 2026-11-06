import PortalHome from "@/components/PortalHome";
import { companyBySlug } from "@/lib/access";
import { getSession } from "@/lib/guard";
import { logoSrc } from "@/lib/companies";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// (a página fica no mesmo segmento do layout, então o modelo "%s · Empresa" não se aplica aqui — montamos o título inteiro)
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await companyBySlug(slug);
  return { title: company ? `Início · ${company.name}` : "Início" };
}

/** Início do portal: a marca da empresa, os números atendidos, a fila de conversas e o funil — antes de cair no Atendimento. */
export default async function PortalInicio({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await companyBySlug(slug);
  if (!company) notFound();
  const session = await getSession();
  return <PortalHome company={{ name: company.name, slug: company.slug, tagline: company.tagline || null, logo: logoSrc(company) }} userName={session?.user.name || ""} />;
}
