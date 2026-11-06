import { headers } from "next/headers";

/** Endereço público do sistema (usado para montar as URLs do webhook e das páginas legais). */
export async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
