import { AppShell } from "@/components/shell/AppShell";
import { DisparosShell } from "@/components/disparos/DisparosShell";
import { Contacts } from "@/components/disparos/Contacts";

export const metadata = { title: "Contatos e opt-out" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  return <AppShell><DisparosShell><Contacts initialTab={aba === "blacklist" ? "blacklist" : "contatos"} /></DisparosShell></AppShell>;
}
