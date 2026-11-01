import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Design system: Geist (UI) + Geist Mono (IDs, wamid, WABA ID).
const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "Painel admin | API Hub", template: "%s | API Hub" },
  description: "Painel de operação da plataforma: clientes, BMs, números e infraestrutura.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "dark",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-surface="admin" data-theme="ecossistema" data-density="compact" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
