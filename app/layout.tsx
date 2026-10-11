import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/pwa-register";
import "./globals.css";

const siteUrl = "https://lpnec-oculab.oculablpnec.workers.dev";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "LPNeC Oculab — Tabulação de Eye Tracking",
  description: "Plataforma do LPNeC para limpeza, tabulação, auditoria e organização de dados de eye tracking para análise no JASP, SPSS e Excel.",
  applicationName: "LPNeC Oculab",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: "VQHIvRRu-Cvs6pLhAe3W2-c7G8gGbTbvYEuvRMu8Nls",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: siteUrl,
    siteName: "LPNeC Oculab",
    title: "LPNeC Oculab — Tabulação de Eye Tracking",
    description: "Organize, limpe, audite e exporte dados de eye tracking para pesquisa científica.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "LPNeC Oculab" }],
  },
  twitter: {
    card: "summary",
    title: "LPNeC Oculab — Tabulação de Eye Tracking",
    description: "Organize, limpe, audite e exporte dados de eye tracking para pesquisa científica.",
    images: ["/icon-512.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon-32.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c1d2a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LPNeC Oculab",
    alternateName: "Oculab",
    url: siteUrl,
    description: "Plataforma para limpeza, tabulação, auditoria e organização de dados de eye tracking para pesquisa científica.",
    inLanguage: "pt-BR",
  };

  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
