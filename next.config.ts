import type { NextConfig } from "next";

const isStaticPreview = process.env.STATIC_PREVIEW === "1";
// O teste de integração roda a própria instância do Next; um distDir próprio evita
// colidir com um servidor de desenvolvimento já em execução no mesmo diretório.
const isolatedDistDir = process.env.NEXT_DIST_DIR;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "127.0.0.1", "localhost"],
  ...(isolatedDistDir ? { distDir: isolatedDistDir } : {}),
  ...(isStaticPreview ? { output: "export" as const, assetPrefix: "./" } : {}),
};

export default nextConfig;
