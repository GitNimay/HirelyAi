import { clerkClient, type User } from "@clerk/nextjs/server";
import { env } from "cloudflare:workers";

/** Someone as seen by one viewer: mutual connections and "follows you" are relative to that viewer. */
export type Person = {
  id: string;
  name: string;
  imageUrl: string | null;
  headline: string | null;
  mutual: number;
  followsYou: boolean;
  at: number; // when invited / connected; 0 for suggestions
};
export type Counts = { connections: number; following: number; followers: number };
export type Network = { received: Person[]; sent: Person[]; connections: Person[]; suggestions: Person[]; counts: Counts };

type Row = { id: string; name: string; image_url: string | null; headline: string | null; mutual: number; follows_you: number; at: number };

const toPerson = (r: Row): Person => ({
  id: r.id, name: r.name, imageUrl: r.image_url, headline: r.headline, mutual: r.mutual, followsYou: !!r.follows_you, at: r.at ?? 0,
});

// ?1 is always the viewer
const PERSON = `u.id, u.name, u.image_url, u.headline,
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

type Profile = { id: string; name: string; imageUrl: string | null; headline: string | null };

export const profileOf = (u: User): Profile => ({
  id: u.id,
  name: u.fullName || u.username || "Member",
  imageUrl: u.imageUrl ?? null,
  headline: typeof u.publicMetadata?.headline === "string" ? u.publicMetadata.headline : null,
});

// No-op write when nothing changed
const upsertUser = (u: Profile) =>
  env.DB.prepare(
    `INSERT INTO users (id, name, image_url, headline, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (id) DO UPDATE SET name = ?2, image_url = ?3, headline = ?4, updated_at = ?5
     WHERE name IS NOT ?2 OR image_url IS NOT ?3 OR headline IS NOT ?4`,
  ).bind(u.id, u.name, u.imageUrl, u.headline, Date.now());

/** Snapshot a Clerk profile so feeds and the network can join on it. */
export async function saveUser(u: Profile) {
  await upsertUser(u).run();
}

let directorySyncedAt = 0;

/**
 * Copy every Clerk member into D1 so People you may know and search cover the whole platform,
 * including people who signed up but never opened the app since.
 * ponytail: per-isolate 5 min throttle, newest 500 members. Swap for a Clerk `user.created/updated`
 * webhook when the member count outgrows one page.
 */
export async function syncDirectory() {
  if (Date.now() - directorySyncedAt < 5 * 60_000) return;
  directorySyncedAt = Date.now();
  try {
    const { data } = await (await clerkClient()).users.getUserList({ limit: 500, orderBy: "-created_at" });
    if (data.length) await env.DB.batch(data.map((u) => upsertUser(profileOf(u))));
  } catch (e) {
    directorySyncedAt = 0; // retry on the next request; the page still works with what D1 has
    console.error("syncDirectory failed", e);
  }
}
