import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Replay evals (npm run eval): recorded interviews through the real evaluator model, to regression-test prompt
// changes. They cost Bedrock calls, so they live outside the default config and never run in CI.
export default defineConfig({
  resolve: { alias: { "@": path("."), "cloudflare:workers": path("tests/support/cloudflare-workers.ts") } },
  test: { include: ["tests/evals/**/*.eval.ts"], environment: "node", testTimeout: 180_000 },
});
