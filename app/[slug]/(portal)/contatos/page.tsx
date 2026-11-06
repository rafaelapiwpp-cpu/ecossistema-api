import Contacts from "@/components/Contacts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contatos" };

export default async function PortalContatos({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <div className="topbar"><div className="title"><h1>Contatos</h1><p>Seus leads e clientes, com etiquetas e observações</p></div></div>
      <Contacts client base={`/${slug}/atendimento`} />
    </>
  );
}
