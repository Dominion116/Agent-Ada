import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @ada/shared ships ESM; let Next transpile it from the workspace source.
  transpilePackages: ["@ada/shared"],
};

// Dashboard is wallet-gated and client-rendered; no special server config needed.

export default nextConfig;
