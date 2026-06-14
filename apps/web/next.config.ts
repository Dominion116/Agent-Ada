import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @ada/shared ships ESM; let Next transpile it from the workspace source.
  transpilePackages: ["@ada/shared"],
  turbopack: {
    resolveAlias: {
      // @wagmi/connectors' unused "tempo" connectors dynamically import an
      // unpublished "accounts" package; alias it to a stub so the bundler
      // doesn't fail resolving it (see src/lib/empty-module.ts).
      accounts: "./src/lib/empty-module.ts",
    },
  },
};

// Dashboard is wallet-gated and client-rendered; no special server config needed.

export default nextConfig;
