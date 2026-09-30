import { env } from "cloudflare:workers";
import type { Media } from "./feed";

/** Messages pushed to every connected (signed-in) feed: ids, counts, and edited content of posts they can already read. */
export type FeedEvent =
  | { t: "post"; id: string; authorId: string }
  | { t: "stats"; id: string; likes: number; comments: number; reposts: number }
  | { t: "edit"; id: string; body: string; media: Media[]; editedAt: number }
  | { t: "delete"; id: string };

// ponytail: fixed shard count, every event fans out to all shards. Move to per-follower-group shards
// if events/sec × shards gets expensive.
export const HUB_SHARDS = 4;

export const hubFor = (userId: string) => {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `hub-${Math.abs(h) % HUB_SHARDS}`;
};

export async function broadcast(event: FeedEvent) {
  const msg = JSON.stringify(event);
  // Realtime is best effort: a failed push must never fail the write that caused it
  await Promise.allSettled(Array.from({ length: HUB_SHARDS }, (_, i) => env.FEED_HUB.getByName(`hub-${i}`).broadcast(msg)));
}
