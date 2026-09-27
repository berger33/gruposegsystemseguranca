import type { Metadata } from "next";
import "./globals.css";
import "./theme-tech.css";
import "./theme-collection.css";

export const metadata: Metadata = {
  title: "Grupo SEG System | Segurança Integrada em Guarulhos",
  description:
    "Segurança desarmada, monitoramento, CFTV, portaria, limpeza e supervisão para sua operação em Guarulhos e região.",
  robots: { index: false, follow: false }, // Prévia: não indexar antes da revisão e publicação.
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
