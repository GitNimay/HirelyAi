// Node stand-in for the `cloudflare:workers` runtime module (aliased in vitest.config.ts).
// Unit tests assign the env fields they need; integration tests get real local bindings from getPlatformProxy.
export const env = {} as Cloudflare.Env;

const pending: Promise<unknown>[] = [];

/** Same contract as the runtime: run the promise after the response, never fail the request. */
export function waitUntil(promise: Promise<unknown>) {
  pending.push(promise.catch(() => {}));
}

/** Test helper: wait for everything handed to waitUntil so far. */
export async function settleWaitUntil() {
  await Promise.all(pending.splice(0));
}
