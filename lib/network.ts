import { createClerkClient, type User } from "@clerk/backend";
import { env } from "cloudflare:workers";
import { slugify } from "./profile-fields";

/** Someone as seen by one viewer: mutual connections and "follows you" are relative to that viewer. */
export type Person = {
  id: string;
  name: string;
  imageUrl: string | null;
  headline: string | null;
  handle: string | null;
  bio: string | null; // first 120 chars, enough for a one-line summary
  mutual: number;
  followsYou: boolean;
  at: number; // when invited / connected; 0 for suggestions
};
export type Counts = { connections: number; following: number; followers: number };
export type Network = { received: Person[]; sent: Person[]; connections: Person[]; suggestions: Person[]; counts: Counts };

type Row = { id: string; name: string; image_url: string | null; headline: string | null; handle: string | null; bio: string | null; mutual: number; follows_you: number; at: number };

const toPerson = (r: Row): Person => ({
  id: r.id, name: r.name, imageUrl: r.image_url, headline: r.headline, handle: r.handle, bio: r.bio, mutual: r.mutual, followsYou: !!r.follows_you, at: r.at ?? 0,
});

// ?1 is always the viewer
const PERSON = `u.id, u.name, u.image_url, u.headline, u.handle, substr(u.bio, 1, 120) AS bio,
  (SELECT COUNT(*) FROM connections a JOIN connections b ON b.user_id = u.id AND b.peer_id = a.peer_id WHERE a.user_id = ?1) AS mutual,
  EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = u.id AND f.followee_id = ?1) AS follows_you`;

const COUNTS = `SELECT (SELECT COUNT(*) FROM connections WHERE user_id = ?1) AS connections,
  (SELECT COUNT(*) FROM follows WHERE follower_id = ?1) AS following,
  (SELECT COUNT(*) FROM follows WHERE followee_id = ?1) AS followers`;

/**
 * People you may know, LinkedIn style: friends-of-friends (triangle closing) dominate, then follow edges
 * and people whose posts you engaged with; everyone else fills in for new members.
 * ponytail: scored in one SQL pass incl. a full users scan for cold start; move to a precomputed
 * per-user list (Queues/cron) once the users table is large.
 */
const SUGGESTIONS = `
  SELECT ${PERSON}, 0 AS at FROM (
    SELECT c2.peer_id AS id, 10.0 AS w FROM connections c1 JOIN connections c2 ON c2.user_id = c1.peer_id WHERE c1.user_id = ?1
    -- one term for both follow directions: D1 allows at most 5 terms in a compound SELECT
    UNION ALL SELECT IIF(followee_id = ?1, follower_id, followee_id), IIF(followee_id = ?1, 5.0, 3.0) FROM follows WHERE followee_id = ?1 OR follower_id = ?1
    UNION ALL SELECT p.author_id, 2.0 FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.author_id = ?1
    UNION ALL SELECT p.author_id, 1.0 FROM likes l JOIN posts p ON p.id = l.post_id WHERE l.user_id = ?1
    UNION ALL SELECT id, 0.0 FROM users
  ) s JOIN users u ON u.id = s.id
  WHERE s.id <> ?1
    AND s.id NOT IN (SELECT peer_id FROM connections WHERE user_id = ?1)
    AND s.id NOT IN (SELECT to_id FROM invitations WHERE from_id = ?1)
    AND s.id NOT IN (SELECT from_id FROM invitations WHERE to_id = ?1)
    AND s.id NOT IN (SELECT peer_id FROM suggestion_dismissals WHERE user_id = ?1)
  GROUP BY u.id ORDER BY SUM(s.w) DESC, u.updated_at DESC LIMIT 24`;

export async function getNetwork(viewerId: string): Promise<Network> {
  const [received, sent, connections, suggestions, counts] = await env.DB.batch<Row | Counts>([
    env.DB.prepare(`SELECT ${PERSON}, i.created_at AS at FROM invitations i JOIN users u ON u.id = i.from_id WHERE i.to_id = ?1 ORDER BY i.created_at DESC LIMIT 100`).bind(viewerId),
    env.DB.prepare(`SELECT ${PERSON}, i.created_at AS at FROM invitations i JOIN users u ON u.id = i.to_id WHERE i.from_id = ?1 ORDER BY i.created_at DESC LIMIT 100`).bind(viewerId),
    // ponytail: first 500 connections only; page this when someone gets there
    env.DB.prepare(`SELECT ${PERSON}, c.created_at AS at FROM connections c JOIN users u ON u.id = c.peer_id WHERE c.user_id = ?1 ORDER BY c.created_at DESC LIMIT 500`).bind(viewerId),
    env.DB.prepare(SUGGESTIONS).bind(viewerId),
    env.DB.prepare(COUNTS).bind(viewerId),
  ]);
  const people = (r: { results: unknown[] }) => (r.results as Row[]).map(toPerson);
  return {
    received: people(received),
    sent: people(sent),
    connections: people(connections),
    suggestions: people(suggestions),
    counts: counts.results[0] as Counts,
  };
}

/** `id` as seen by `viewerId`, plus the viewer's own counts. */
export async function getPersonAndCounts(viewerId: string, id: string) {
  const [person, counts] = await env.DB.batch<Row | Counts>([
    env.DB.prepare(`SELECT ${PERSON}, COALESCE(
        (SELECT created_at FROM connections WHERE user_id = ?1 AND peer_id = u.id),
        (SELECT created_at FROM invitations WHERE (from_id = ?1 AND to_id = u.id) OR (from_id = u.id AND to_id = ?1)), 0) AS at
      FROM users u WHERE u.id = ?2`).bind(viewerId, id),
    env.DB.prepare(COUNTS).bind(viewerId),
  ]);
  const row = person.results[0] as Row | undefined;
  return { person: row && toPerson(row), counts: counts.results[0] as Counts };
}

/** People whose name or headline matches, name prefix matches first, then by mutual connections. */
export async function searchPeople(viewerId: string, query: string) {
  const q = query.trim().slice(0, 64).replace(/[!%_]/g, "!$&"); // escape LIKE wildcards
  if (!q) return [];
  const { results } = await env.DB.prepare(
    `SELECT ${PERSON}, 0 AS at FROM users u
     WHERE u.id <> ?1 AND (u.name LIKE ?2 ESCAPE '!' OR u.headline LIKE ?2 ESCAPE '!')
     ORDER BY u.name LIKE ?3 ESCAPE '!' DESC, mutual DESC, u.name LIMIT 20`,
  ).bind(viewerId, `%${q}%`, `${q}%`).all<Row>();
  return results.map(toPerson);
}

type Profile = { id: string; name: string; imageUrl: string | null; headline: string | null; joinedAt: number };

export const profileOf = (u: User): Profile => ({
  id: u.id,
  name: u.fullName || u.username || "Member",
  imageUrl: u.imageUrl ?? null,
  headline: typeof u.publicMetadata?.headline === "string" ? u.publicMetadata.headline : null,
  joinedAt: u.createdAt,
});

/**
 * Clerk is only the starting point: once a member edits their profile here (custom = 1) D1 owns name, photo and headline.
 * Second statement gives everyone a clean /in/<handle> (name slug, plus 4 id characters only if it's taken) and a joined date.
 * No-op writes when nothing changed.
 */
const upsert = (u: Profile) =>
  env.DB.prepare(
    `INSERT INTO users (id, name, image_url, headline, joined_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?6, ?5)
     ON CONFLICT (id) DO UPDATE SET name = ?2, image_url = ?3, headline = ?4, updated_at = ?5
     WHERE custom = 0 AND (name IS NOT ?2 OR image_url IS NOT ?3 OR headline IS NOT ?4)`,
  ).bind(u.id, u.name, u.imageUrl, u.headline, Date.now(), u.joinedAt);

const assign = (u: Profile) =>
  env.DB.prepare(
    `UPDATE users SET handle = COALESCE(handle, ?2 || CASE WHEN EXISTS (SELECT 1 FROM users WHERE handle = ?2) THEN '-' || lower(substr(id, -4)) ELSE '' END),
       joined_at = COALESCE(joined_at, ?3)
     WHERE id = ?1 AND (handle IS NULL OR joined_at IS NULL)`,
  ).bind(u.id, slugify(u.name), u.joinedAt);

export const syncStatements = (u: Profile) => [upsert(u), assign(u)];

/**
 * Cron: copy every Clerk member into D1 so People you may know and search cover the whole platform,
 * including people who signed up but never opened the app since (members who do open it are synced on page load).
 * ponytail: newest 500 members every 15 min. Swap for a Clerk `user.created/updated` webhook when the member count outgrows one page.
 */
export async function syncDirectory() {
  try {
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY });
    const { data } = await clerk.users.getUserList({ limit: 500, orderBy: "-created_at" });
    // Handles are only (re)assigned for members that lack one, which keeps the batch near one statement per member
    const { results } = await env.DB.prepare("SELECT id FROM users WHERE handle IS NOT NULL AND joined_at IS NOT NULL").all<{ id: string }>();
    const done = new Set(results.map((r) => r.id));
    if (data.length) await env.DB.batch(data.flatMap((u) => { const p = profileOf(u); return done.has(p.id) ? [upsert(p)] : [upsert(p), assign(p)]; }));
  } catch (e) {
    console.error("syncDirectory failed", e); // next cron run retries; the app works with what D1 has
  }
}

export type FollowDir = "followers" | "following";
/** A row in a followers / following list, plus whether the viewer follows them. */
export type FollowPerson = Person & { iFollow: boolean };
const FOLLOW_PAGE = 50;

/** Who follows `userId` (followers) or whom they follow (following), newest first. Cursor = rows already seen. */
export async function listFollows(viewerId: string, userId: string, dir: FollowDir, cursor?: string) {
  const offset = Number(cursor) || 0;
  const [them, owner] = dir === "followers" ? ["f.follower_id", "f.followee_id"] : ["f.followee_id", "f.follower_id"];
  const { results } = await env.DB.prepare(
    `SELECT ${PERSON}, f.created_at AS at, EXISTS (SELECT 1 FROM follows x WHERE x.follower_id = ?1 AND x.followee_id = u.id) AS i_follow
     FROM follows f JOIN users u ON u.id = ${them}
     WHERE ${owner} = ?2 ORDER BY f.created_at DESC LIMIT ${FOLLOW_PAGE} OFFSET ?3`,
  ).bind(viewerId, userId, offset).all<Row & { i_follow: number }>();
  const people: FollowPerson[] = results.map((r) => ({ ...toPerson(r), iFollow: !!r.i_follow }));
  return { people, next: results.length === FOLLOW_PAGE ? String(offset + FOLLOW_PAGE) : null };
}
