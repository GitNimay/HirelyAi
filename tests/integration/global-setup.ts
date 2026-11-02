import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** A local D1 with every migration applied, copied fresh for each test file. */
    d1Template: string;
  }
}

/**
 * Builds the schema once per run from the committed migrations, exactly as deploys do (`wrangler d1 migrations
 * apply`). Starting from an empty directory proves the migrations alone produce a working database.
 */
export default function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), "he-d1-template-"));
  execFileSync(
    process.execPath,
    [
      join(process.cwd(), "node_modules/wrangler/bin/wrangler.js"),
      "d1",
      "migrations",
      "apply",
      "hire-excellence-db",
      "--local",
      "--config",
      "tests/integration/wrangler.jsonc",
      "--persist-to",
      dir,
    ],
    { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" } },
  );
  project.provide("d1Template", dir);
  return () => rmSync(dir, { recursive: true, force: true });
}
