import type { Metadata } from "next";
import "./globals.css";
import "../styles/ux-tokens.css";
import "../styles/themes.css";
import PublishedTheme from "@/components/PublishedTheme";

// Produção gate: noindex preservado por padrão (beta). Para liberar produção, definir NEXT_PUBLIC_ALLOW_INDEX=true + is_beta_mode false via API
const allowIndex = process.env.NEXT_PUBLIC_ALLOW_INDEX === 'true' && process.env.NEXT_PUBLIC_ENV === 'production';

export const metadata: Metadata = {
  title: "Grupo SEG System | Segurança Integrada em Guarulhos",
  description:
    "Segurança desarmada, monitoramento, CFTV, portaria, limpeza e supervisão para sua operação em Guarulhos e região.",
  robots: allowIndex ? { index: true, follow: true } : { index: false, follow: false }, // Prévia: não indexar antes da revisão e publicação. Produção: NEXT_PUBLIC_ALLOW_INDEX=true + NEXT_PUBLIC_ENV=production
  manifest: "/api/pwa/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "SEG Func" },
  icons: {
    icon: [{ url: "/brand/grupo-seg-system-original.jpg", sizes: "345x345", type: "image/jpeg" }],
    apple: [{ url: "/brand/grupo-seg-system-original.jpg", sizes: "345x345", type: "image/jpeg" }],
  },
};

export const viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/api/pwa/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <PublishedTheme />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/api/pwa/sw.js', { scope: '/' })
                    .then(function(reg){ console.log('SW registered', reg.scope); })
                    .catch(function(err){ console.log('SW fail', err); });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
