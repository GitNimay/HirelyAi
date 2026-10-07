import { env, waitUntil } from "cloudflare:workers";
import type { Media } from "./feed";
import type { AppStatus } from "./job-fields";
import type { Counts, Person } from "./network";
import type { Notification } from "./notifications";

/** Messages pushed to every connected (signed-in) feed: ids, counts, and edited content of posts they can already read. */
export type FeedEvent =
  | { t: "post"; id: string; authorId: string }
  | { t: "stats"; id: string; likes: number; comments: number; reposts: number }
  | { t: "edit"; id: string; body: string; media: Media[]; editedAt: number }
  | { t: "delete"; id: string }
  // A member edited their profile: everyone showing them (feed, network, profile page) updates in place
  | { t: "profile"; id: string; name: string; handle: string; headline: string | null; bio: string | null; imageUrl: string | null };

/** Private network change, sent only to the people involved. `dir` is "out" when the recipient caused it. */
export type NetEvent = {
  t: "net";
  kind: "invite" | "uninvite" | "connect" | "disconnect" | "follow";
  dir: "in" | "out";
  person: Person;
  counts: Counts;
};

/** Public job changes: a new listing, or its applicant count / open state. */
export type JobEvent =
  | { t: "job"; id: string; posterId: string }
  | { t: "jobstat"; id: string; applicants: number; closed: boolean };

/** Private: to the poster when someone applies, to the applicant when the poster moves their application. */
export type AppEvent = { t: "app"; jobId: string; applicantId: string; status: AppStatus };

/**
 * Private, to the recipient's every tab and device: a new or changed notification (with the fresh badge count), one that
 * went away (deleted, or retracted because the like/follow/invite behind it was undone), read state, and "seen".
 */
export type NotifEvent =
  | { t: "notif"; n: Notification; unseen: number }
  | { t: "notif-del"; id: string; unseen: number }
  | { t: "notif-read"; id?: string } // no id: all of them
  | { t: "notif-seen" };

export type RealtimeEvent = FeedEvent | NetEvent | JobEvent | AppEvent | NotifEvent;

// ponytail: fixed shard count, every event fans out to all shards. Move to per-follower-group shards
// if events/sec × shards gets expensive.
export const HUB_SHARDS = 4;

export const hubFor = (userId: string) => {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `hub-${Math.abs(h) % HUB_SHARDS}`;
};

/**
 * Realtime is best effort and never holds up the write that caused it: pushes finish after the response
 * (waitUntil), and a failed push is dropped. Clients refetch on reconnect.
 */
export function broadcast(event: FeedEvent | JobEvent) {
  const msg = JSON.stringify(event);
  waitUntil(Promise.allSettled(Array.from({ length: HUB_SHARDS }, (_, i) => env.FEED_HUB.getByName(`hub-${i}`).broadcast(msg))));
}

type Private = NetEvent | AppEvent | NotifEvent;

/** Push to one user's open sockets (every tab/device), which all live on that user's hub shard. */
export function sendTo(userId: string, event: Private) {
  waitUntil(env.FEED_HUB.getByName(hubFor(userId)).broadcast(JSON.stringify(event), userId).catch(() => {}));
}

/** Many private pushes (a notification fanned out to followers): one call per hub shard instead of one per recipient. */
export function sendEach(items: { to: string; event: Private }[]) {
  const shards = new Map<string, [string, string][]>();
  for (const { to, event } of items) {
    const hub = hubFor(to);
    shards.set(hub, [...(shards.get(hub) ?? []), [to, JSON.stringify(event)]]);
  }
  waitUntil(Promise.allSettled([...shards].map(([hub, list]) => env.FEED_HUB.getByName(hub).deliver(list))));
}
