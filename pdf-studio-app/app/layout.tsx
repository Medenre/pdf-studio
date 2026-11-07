import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Studio — Votre atelier PDF",
  description:
    "Créez, annotez, signez et organisez vos PDF dans un atelier simple et élégant. Vos documents restent sur votre appareil.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
