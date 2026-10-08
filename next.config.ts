import type { NextConfig } from "next";

const isStaticPreview = process.env.STATIC_PREVIEW === "1";
// O teste de integração roda a própria instância do Next; um distDir próprio evita
// colidir com um servidor de desenvolvimento já em execução no mesmo diretório.
const isolatedDistDir = process.env.NEXT_DIST_DIR;

const nextConfig: NextConfig = {
  // Quick Tunnels receive an ephemeral hostname. The public demo must be
  // allowed to load Next.js dev chunks/HMR, while production stays unaffected.
  allowedDevOrigins: ["*.e2b.app", "*.trycloudflare.com", "127.0.0.1", "localhost"],
  ...(isolatedDistDir ? { distDir: isolatedDistDir } : {}),
  ...(isStaticPreview ? { output: "export" as const, assetPrefix: "./" } : {}),
};

export default nextConfig;
