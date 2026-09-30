import { env } from "cloudflare:workers";
import type { Actor, NotificationType } from "./notification-format";
import { sendTo } from "./realtime";

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

// ponytail: a post/job fans out to at most this many followers (and pushes to them live). Move to a Queue
// consumer for bigger audiences.
const MAX_RECIPIENTS = 200;

export type Spec = { type: NotificationType; actor: string; ref: string; link: string; body?: string | null };

/**
 * Tell `to` (minus the actor) about something, then push it live to their open tabs. Same (type, ref) again
 * from a new actor joins the existing notification; the same actor twice is ignored, so like/unlike spam
 * can't pile up. Best effort like realtime: a failure here never fails the write that caused it.
 */
export async function notifyUsers(to: string[], s: Spec) {
  const ids = JSON.stringify([...new Set(to)].filter((id) => id !== s.actor).slice(0, MAX_RECIPIENTS));
  if (ids === "[]") return;
  const now = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO notifications (id, user_id, type, ref_id, link, body, created_at)
         SELECT lower(hex(randomblob(16))), value, ?1, ?2, ?3, ?4, ?5 FROM json_each(?6)`,
      ).bind(s.type, s.ref, s.link, s.body ?? null, now, ids),
      env.DB.prepare(
        `INSERT OR IGNORE INTO notification_actors (notification_id, actor_id, created_at)
         SELECT id, ?1, ?2 FROM notifications WHERE type = ?3 AND ref_id = ?4 AND user_id IN (SELECT value FROM json_each(?5))`,
      ).bind(s.actor, now, s.type, s.ref, ids),
    ]);
    const { results } = await env.DB.prepare(`${SELECT} WHERE n.type = ?1 AND n.ref_id = ?2 AND n.user_id IN (SELECT value FROM json_each(?3))`)
      .bind(s.type, s.ref, ids).all<Row>();
    await Promise.all(results.map((r) => sendTo(r.user_id, { t: "notif", n: toNotification(r), unseen: r.unseen })));
  } catch (e) {
    console.error("notifyUsers failed", e);
  }
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
