import { env } from "cloudflare:workers";
import type { Spec } from "./notifications";

/**
 * Background work, off the request path. Consumed in worker/index.ts; a throw retries the message with backoff
 * (wrangler.jsonc `queues`), and messages that keep failing land in the dead-letter queue.
 */
export type Task =
  | { t: "evaluate"; sessionId: string } // AI grading of a finished voice interview (Bedrock, can take a minute)
  | { t: "invite"; jobId: string; to: string } // interview invite email to a new applicant
  | { t: "notify"; to: string[]; spec: Spec }; // write notifications and push them live

export const enqueue = (task: Task) => env.TASKS.send(task, { contentType: "json" });
