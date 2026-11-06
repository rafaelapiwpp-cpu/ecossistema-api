import "@fontsource-variable/inter/opsz.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
  icons: { icon: [{ url: "/icon.png", type: "image/png", sizes: "128x128" }], apple: "/icon.png" },
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Estado do menu lateral e da aparência antes da primeira pintura (evita "pulo" ao abrir a página).
// Aparência padrão: clara. Escuro ou "segue o sistema" só se a pessoa escolher.
const bootScript = `try{var d=document.documentElement;if(localStorage.getItem("hub.nav")==="min")d.classList.add("nav-min");var t=localStorage.getItem("hub.theme");if(t==="dark")d.dataset.theme="dark";else if(t!=="auto")d.dataset.theme="light"}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: bootScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
