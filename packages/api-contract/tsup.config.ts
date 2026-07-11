import { defineConfig } from "tsup";

/**
 * Dual-format build (ESM + CJS) so every consumer works:
 * bundlers (mobile/admin) take ESM, the CommonJS NestJS backend takes CJS.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
});
