import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Resolve workspace packages to their TypeScript source during tests
      // so we never need to rebuild them between changes.
      "@ada/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@ada/contracts": resolve(__dirname, "../../packages/contracts/src/index.ts"),
    },
  },
  test: {
    globals: true,
  },
});
