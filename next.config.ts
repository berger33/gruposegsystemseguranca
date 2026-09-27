import type { NextConfig } from "next";

const isStaticPreview = process.env.STATIC_PREVIEW === "1";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app"],
  ...(isStaticPreview ? { output: "export" as const, assetPrefix: "./" } : {}),
};

export default nextConfig;
