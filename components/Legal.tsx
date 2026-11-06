import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function Legal({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="legal">
      <div className="brand" style={{ padding: "0 0 24px" }}><span className="brand-dot" aria-hidden /><Link href="/">{BRAND.name}</Link></div>
      <h1>{title}</h1>
      <p className="muted" style={{ marginTop: 0 }}>Última atualização: {updated}</p>
      {children}
      <p style={{ marginTop: 40, fontSize: 13 }}>
        <Link href="/privacidade">Política de privacidade</Link> · <Link href="/termos">Termos de serviço</Link> · <Link href="/exclusao-de-dados">Exclusão de dados</Link>
      </p>
    </div>
  );
}
