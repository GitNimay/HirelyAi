import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Kept apart from vite.config.ts on purpose: tests need none of the vinext / Cloudflare build plugins.
export default defineConfig({
  resolve: {
    alias: {
      "@": path("."),
      // The Workers runtime module doesn't exist in Node. Unit tests get an empty `env` they fill per test;
      // integration tests fill it with real local bindings (tests/integration/setup.ts).
      "cloudflare:workers": path("tests/support/cloudflare-workers.ts"),
    },
  },
  test: {
    // Every test starts clean: call history cleared, vi.spyOn spies restored, stubbed globals put back
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      // A floor just under today's numbers, so coverage can only go up. Raise it as tests are added.
      thresholds: { lines: 66, statements: 65, functions: 64, branches: 58 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // Each file boots its own local D1 (workerd), which takes a few seconds
          hookTimeout: 60_000,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
