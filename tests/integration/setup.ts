import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "cloudflare:workers";
import { afterAll, beforeAll, inject } from "vitest";
import { getPlatformProxy } from "wrangler";

// Each test file gets its own copy of the migrated database, so files run in parallel without sharing rows.
// Inside a file, tests stay independent by creating their own data with unique ids (./factories.ts).
let proxy: Awaited<ReturnType<typeof getPlatformProxy<Cloudflare.Env>>> | undefined;
let dir: string | undefined;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "he-d1-"));
  cpSync(inject("d1Template"), dir, { recursive: true });
  proxy = await getPlatformProxy<Cloudflare.Env>({
    configPath: "tests/integration/wrangler.jsonc",
    persist: { path: join(dir, "v3") },
    remoteBindings: false,
  });
  Object.assign(env, proxy.env);
  globalThis.caches = proxy.caches as unknown as CacheStorage;
});

afterAll(async () => {
  await proxy?.dispose();
  if (dir) rmSync(dir, { recursive: true, force: true });
});
