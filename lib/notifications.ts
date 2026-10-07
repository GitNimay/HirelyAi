import { env } from "cloudflare:workers";
import type { Actor, NotificationType } from "./notification-format";
import { sendEach, sendTo } from "./realtime";
import { enqueue } from "./tasks";

export type Notification = {
  id: string;
  type: NotificationType;
  link: string;
  body: string | null;
  at: number;
  read: boolean;
  actors: Actor[]; // newest first, at most 3
  count: number; // everyone who took part
};

type Row = {
  id: string; user_id: string; type: NotificationType; link: string; body: string | null; created_at: number;
  read_at: number | null; count: number; actors: string | null; unseen: number;
};

const toNotification = (r: Row): Notification => ({
  id: r.id, type: r.type, link: r.link, body: r.body, at: r.created_at, read: r.read_at !== null, count: r.count,
  actors: r.actors ? JSON.parse(r.actors) : [],
});

const SELECT = `SELECT n.id, n.user_id, n.type, n.link, n.body, n.created_at, n.read_at,
    (SELECT COUNT(*) FROM notification_actors a WHERE a.notification_id = n.id) AS count,
    (SELECT json_group_array(json_object('id', u.id, 'name', u.name, 'imageUrl', u.image_url))
       FROM (SELECT actor_id FROM notification_actors WHERE notification_id = n.id ORDER BY created_at DESC LIMIT 3) t
       JOIN users u ON u.id = t.actor_id) AS actors,
    (SELECT COUNT(*) FROM notifications x WHERE x.user_id = n.user_id AND x.created_at > me.notif_seen_at) AS unseen
  FROM notifications n JOIN users me ON me.id = n.user_id`;

/**
 * Is what the notification announces still true? Checked when a queued delivery lands: the actor may have unliked,
 * unfollowed or withdrawn in the meantime, and a stale message must not resurface it. `to` is the recipient column.
 * ?2 = ref, ?7 = actor. Status changes (app_*, job_closed) are facts at the time they happened.
 */
const STILL: Record<NotificationType, (to: string) => string> = {
  like: () => "EXISTS (SELECT 1 FROM likes WHERE user_id = ?7 AND post_id = ?2)",
  repost: () => "EXISTS (SELECT 1 FROM posts WHERE author_id = ?7 AND repost_of = ?2)",
  comment: () => "EXISTS (SELECT 1 FROM comments WHERE id = ?2)",
  thread: () => "EXISTS (SELECT 1 FROM comments WHERE id = ?2)",
  post: () => "EXISTS (SELECT 1 FROM posts WHERE id = ?2)",
  follow: (to) => `EXISTS (SELECT 1 FROM follows WHERE follower_id = ?7 AND followee_id = ${to})`,
  invite: (to) => `EXISTS (SELECT 1 FROM invitations WHERE from_id = ?7 AND to_id = ${to})`,
  accept: (to) => `EXISTS (SELECT 1 FROM connections WHERE user_id = ?7 AND peer_id = ${to})`,
  applicant: () => "EXISTS (SELECT 1 FROM applications WHERE job_id = ?2 AND applicant_id = ?7)",
  job: () => "EXISTS (SELECT 1 FROM jobs WHERE id = ?2)",
  app_viewed: () => "1",
  app_shortlisted: () => "1",
  app_rejected: () => "1",
  job_closed: () => "1",
};

// ponytail: a post/job fans out to at most this many followers, in one queue message. Split into chunked
// messages (one per 200) for bigger audiences.
const MAX_RECIPIENTS = 200;

export type Spec = { type: NotificationType; actor: string; ref: string; link: string; body?: string | null };

/**
 * Tell `to` (minus the actor) about something. Queued (lib/tasks.ts), so the write that caused it returns right away
 * and a failed delivery is retried instead of lost. Best effort: a queue hiccup never fails the write.
 */
export async function notifyUsers(to: string[], spec: Spec) {
  const ids = [...new Set(to)].filter((id) => id !== spec.actor).slice(0, MAX_RECIPIENTS);
  if (ids.length) await enqueue({ t: "notify", to: ids, spec }).catch((e) => console.error("notifyUsers: enqueue failed", e));
}

/**
 * Queue consumer side: store the notifications, then push them live to their open tabs. Same (type, ref) again
 * from a new actor joins the existing notification; the same actor twice is ignored, so like/unlike spam
 * can't pile up. Idempotent (INSERT OR IGNORE), so a retried message doesn't duplicate anything, and guarded by
 * STILL, so a delivery that lands after the action was undone does nothing.
 */
export async function deliverNotifications(to: string[], s: Spec) {
  const ids = JSON.stringify(to);
  const now = Date.now();
  // ?3 / ?4 are unused by the second statement; one bind list keeps the numbering identical for STILL
  const args = [s.type, s.ref, s.link, s.body ?? null, now, ids, s.actor];
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO notifications (id, user_id, type, ref_id, link, body, created_at)
       SELECT lower(hex(randomblob(16))), value, ?1, ?2, ?3, ?4, ?5 FROM json_each(?6) WHERE value IN (SELECT id FROM users) AND ${STILL[s.type]("value")}`,
    ).bind(...args),
    env.DB.prepare(
      `INSERT OR IGNORE INTO notification_actors (notification_id, actor_id, created_at)
       SELECT id, ?7, ?5 FROM notifications WHERE type = ?1 AND ref_id = ?2 AND user_id IN (SELECT value FROM json_each(?6)) AND ${STILL[s.type]("notifications.user_id")}`,
    ).bind(...args),
  ]);
  // Only rows this delivery changed (new, or resurfaced by a new actor: the trigger stamps them with `now`)
  const { results } = await env.DB.prepare(`${SELECT} WHERE n.type = ?1 AND n.ref_id = ?2 AND n.user_id IN (SELECT value FROM json_each(?3)) AND n.created_at = ?4`)
    .bind(s.type, s.ref, ids, now).all<Row>();
  sendEach(results.map((r) => ({ to: r.user_id, event: { t: "notif", n: toNotification(r), unseen: r.unseen } })));
}

/**
 * The actor undid what a notification announced (unlike, un-repost, unfollow, withdrawn or answered invite): take them
 * off it, drop it when nobody is left, and update the recipient's open tabs. Call after the undo is committed; a delivery
 * still in the queue is stopped by STILL, so the two can't race into a stale notification.
 */
export async function retractNotification(type: NotificationType, actor: string, ref: string, to: string) {
  const [off, gone] = await env.DB.batch<{ id: string; user_id: string }>([
    env.DB.prepare("DELETE FROM notification_actors WHERE actor_id = ?1 AND notification_id = (SELECT id FROM notifications WHERE user_id = ?2 AND type = ?3 AND ref_id = ?4)")
      .bind(actor, to, type, ref),
    env.DB.prepare(
      `DELETE FROM notifications WHERE user_id = ?1 AND type = ?2 AND ref_id = ?3
         AND NOT EXISTS (SELECT 1 FROM notification_actors WHERE notification_id = notifications.id) RETURNING id, user_id`,
    ).bind(to, type, ref),
  ]);
  if (gone.results.length) return announceRemoved(gone.results);
  if (!off.meta.changes) return; // they weren't on it (never delivered): nothing on screen to change
  const row = await env.DB.prepare(`${SELECT} WHERE n.user_id = ?1 AND n.type = ?2 AND n.ref_id = ?3`).bind(to, type, ref).first<Row>();
  if (row) sendTo(to, { t: "notif", n: toNotification(row), unseen: row.unseen });
}

/** Notifications just deleted (`DELETE … RETURNING id, user_id`): remove them from their owners' open tabs, with fresh badge counts. */
export async function announceRemoved(rows: { id: string; user_id: string }[]) {
  if (!rows.length) return;
  const { results } = await env.DB.prepare(
    `SELECT u.id, (SELECT COUNT(*) FROM notifications x WHERE x.user_id = u.id AND x.created_at > u.notif_seen_at) AS n
     FROM users u WHERE u.id IN (SELECT value FROM json_each(?))`,
  ).bind(JSON.stringify([...new Set(rows.map((r) => r.user_id))])).all<{ id: string; n: number }>();
  const unseen = new Map(results.map((r) => [r.id, r.n]));
  sendEach(rows.map((r) => ({ to: r.user_id, event: { t: "notif-del", id: r.id, unseen: unseen.get(r.user_id) ?? 0 } })));
}

export async function listNotifications(userId: string, cursor?: string) {
  const [at, id] = cursor ? [Number(cursor.split(":")[0]), cursor.split(":")[1]] : [Number.MAX_SAFE_INTEGER, ""];
  const { results } = await env.DB.prepare(
    `${SELECT} WHERE n.user_id = ?1 AND (n.created_at < ?2 OR (n.created_at = ?2 AND n.id < ?3)) ORDER BY n.created_at DESC, n.id DESC LIMIT 31`,
  ).bind(userId, at, id).all<Row>();
  const page = results.slice(0, 30);
  const last = page[page.length - 1];
  return { items: page.map(toNotification), next: results.length > 30 && last ? `${last.created_at}:${last.id}` : null };
}

export async function unseenCount(userId: string) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notifications x JOIN users me ON me.id = x.user_id WHERE x.user_id = ? AND x.created_at > me.notif_seen_at",
  ).bind(userId).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function followersOf(userId: string) {
  const { results } = await env.DB.prepare("SELECT follower_id FROM follows WHERE followee_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(userId, MAX_RECIPIENTS).all<{ follower_id: string }>();
  return results.map((r) => r.follower_id);
}

/** Newest few, for the dashboard's quick panel. */
export async function latestNotifications(userId: string, n = 3) {
  const { results } = await env.DB.prepare(`${SELECT} WHERE n.user_id = ?1 ORDER BY n.created_at DESC, n.id DESC LIMIT ?2`).bind(userId, n).all<Row>();
  return results.map(toNotification);
}
