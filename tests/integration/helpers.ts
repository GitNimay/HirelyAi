import { auth } from "@clerk/nextjs/server";
import { env } from "cloudflare:workers";
import { onTestFinished, vi } from "vitest";

// Clerk is the one boundary these tests fake: who is signed in. Files that use this must also call
// vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() })) at the top level (Vitest hoists it).

/** Signs `userId` in for the current test, or signs everyone out with null. */
export function signIn(userId: string | null) {
  vi.mocked(auth).mockResolvedValue({ userId } as Awaited<ReturnType<typeof auth>>);
}

type Limiter = { limit: (o: { key: string }) => Promise<{ success: boolean }> };

/**
 * Rate limiter bindings aren't available locally, so tests choose the outcome. Restored after the test.
 * `allow: false` simulates a member who hit the limit.
 */
export function rateLimit(name: "WRITE_LIMIT" | "AI_LIMIT", allow = true) {
  const real = env[name];
  const limit = vi.fn<Limiter["limit"]>().mockResolvedValue({ success: allow });
  (env as unknown as Record<string, Limiter>)[name] = { limit };
  onTestFinished(() => {
    (env as unknown as Record<string, unknown>)[name] = real;
  });
  return limit;
}

/** Stores an object in local R2 the way /api/uploads does. */
export const putMedia = (key: string, owner: string, body: string | Uint8Array = "file", type = "image/png") =>
  env.MEDIA.put(key, body, { httpMetadata: { contentType: type }, customMetadata: { owner } });
