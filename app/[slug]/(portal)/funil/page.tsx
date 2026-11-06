import Funnel from "@/components/Funnel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funil" };

export default async function PortalFunil({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <div className="topbar"><div className="title"><h1>Funil</h1><p>Cada coluna é uma etapa da venda: quem escreve entra em "Novo" sozinho e você arrasta o cartão conforme a conversa avança.</p></div></div>
      <Funnel company={slug} base={`/${slug}/atendimento`} help />
    </>
  );
}
