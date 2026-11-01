import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// IBM Plex Sans servida do próprio repositório (licença OFL em ./fonts).
const plex = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Painel admin | API Hub", template: "%s | API Hub" },
  description: "Painel de operação da plataforma: clientes, BMs, números e infraestrutura.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0e0d14",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={plex.variable}>
      <body>{children}</body>
    </html>
  );
}
